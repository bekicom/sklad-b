// models/Import.js
const mongoose = require("mongoose");

// 🔹 Har bir mahsulot uchun schema (Store modeliga moslashtirilgan)
const productSchema = new mongoose.Schema(
  {
    product_name: { type: String, required: true, trim: true }, // Mahsulot nomi
    model: { type: String, trim: true }, // Model
    unit: {
      type: String,
      enum: ["kg", "dona", "blok", "karobka"],
      required: true,
    }, // O'lchov
    quantity: { type: Number, required: true, min: 0 }, // Miqdor
    unit_price: { type: Number, required: true, min: 0 }, // Xarid narxi (1 dona/kg)
    sell_price: { type: Number, required: true, min: 0 }, // Sotish narxi (1 dona/kg)
    total_price: { type: Number, required: true, min: 0 }, // Jami kelish narxi
    currency: { type: String, enum: ["UZS", "USD"], required: true }, // Valyuta
    box_quantity: { type: Number, default: 0, min: 0 }, // Karobka miqdori
  },
  { _id: false }
);

// 🔹 Import kirimi uchun schema
const importSchema = new mongoose.Schema(
  {
    supplier_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    products: {
      type: [productSchema],
      validate: {
        validator: (arr) => arr.length > 0,
        message: "Kamida bitta mahsulot bo'lishi shart.",
      },
    },

    usd_to_uzs_rate: { type: Number, required: true, min: 0 },

    total_amount_uzs: { type: Number, default: 0, min: 0 },
    paid_amount: { type: Number, default: 0, min: 0 },
    remaining_debt: { type: Number, default: 0, min: 0 },

    partiya_number: { type: Number, required: true, min: 1 },
    delivery_date: { type: Date, default: Date.now },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

// 🔹 Avtomatik umumiy summa va qolgan qarzni hisoblash
importSchema.pre("save", function (next) {
  this.total_amount_uzs = this.products.reduce((sum, p) => {
    const price =
      p.currency === "USD"
        ? p.total_price * this.usd_to_uzs_rate
        : p.total_price;
    return sum + price;
  }, 0);

  this.remaining_debt = Number(
    (this.total_amount_uzs - (this.paid_amount || 0)).toFixed(2)
  );

  next();
});

module.exports = mongoose.model("Import", importSchema);
