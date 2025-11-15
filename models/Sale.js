// models/Sale.js
const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    invoice_number: {
      type: String,
      unique: true,
      required: true,
      default: function () {
        return "INV-" + Date.now(); // masalan: INV-1693839200000
      },
    },

    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    agent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent", // qaysi agent sotgan
      required: false, // admin ham sotishi mumkin
    },

    products: [
      {
        product_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Store",
          required: true,
        },
        name: String,
        model: String,
        unit: { type: String, enum: ["kg", "dona", "blok", "karobka"] },
        quantity: Number,
        box_quantity: { type: Number, default: 0 },
        price: Number,
        purchase_price: Number,
        currency: String,
        partiya_number: Number,
      },
    ],

    total_amount: { type: Number, required: true, min: 0 },
    paid_amount: { type: Number, default: 0, min: 0 },
    remaining_debt: {
      type: Number,
      min: 0,
      default: function () {
        return Math.max(this.total_amount - this.paid_amount, 0);
      },
    },

    payment_method: {
      type: String,
      enum: ["cash", "card", "qarz", "mixed"],
      default: "cash",
    },

    payment_history: [
      { amount: Number, date: { type: Date, default: Date.now } },
    ],

    // Agent sotuvi uchun qo'shimcha maydonlar
    shop_info: {
      name: { type: String, default: "MAZZALI" },
      address: { type: String, default: "Toshkent sh." },
      phone: { type: String, default: "+998 94 732 44 44" },
    },

    // Sotuv holati
    status: {
      type: String,
      enum: ["completed", "pending", "cancelled"],
      default: "completed",
    },

    // Pechat holati
    print_status: {
      type: String,
      enum: ["not_printed", "printed"],
      default: "not_printed",
    },
    printedAt: { type: Date },

    // Sotuv turi: admin yoki agent
    sale_type: {
      type: String,
      enum: ["admin", "agent"],
      default: function () {
        return this.agent_id ? "agent" : "admin";
      },
    },

    // Agent ma'lumotlari (cache uchun)
    agent_info: {
      name: String,
      phone: String,
      location: String, // qaysi viloyatda
    },

    // Qo'shimcha izohlar
    notes: {
      type: String,
      default: "",
    },

    // Chek raqami (print uchun)
    check_number: {
      type: String,
      default: function () {
        return this._id
          ? String(this._id).slice(-6)
          : Date.now().toString().slice(-6);
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// 🔹 Virtual maydonlar
saleSchema.virtual("isAgentSale").get(function () {
  return !!this.agent_id;
});

saleSchema.virtual("isPaidFull").get(function () {
  return this.remaining_debt <= 0;
});

// 🔹 Indexlar
saleSchema.index({ agent_id: 1 });
saleSchema.index({ createdAt: -1 });
saleSchema.index({ invoice_number: 1 });
saleSchema.index({ status: 1 });
saleSchema.index({ sale_type: 1 });

// 🔹 Pre-save middleware - qarz va to'lov usulini hisoblash
saleSchema.pre("save", function (next) {
  // Qarzni qayta hisoblash
  this.remaining_debt = Math.max(this.total_amount - this.paid_amount, 0);

  // To'lov usulini avtomatik belgilash
  if (this.remaining_debt > 0 && this.paid_amount > 0) {
    this.payment_method = "mixed";
  } else if (this.remaining_debt > 0) {
    this.payment_method = "qarz";
  } else if (this.payment_method === "qarz") {
    this.payment_method = "cash"; // to'liq to'langan bo'lsa
  }

  next();
});

module.exports = mongoose.model("Sale", saleSchema);
