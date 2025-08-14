// models/Store.js
const mongoose = require("mongoose");

const storeSchema = new mongoose.Schema(
  {
    // Mahsulot ma'lumotlari
    product_name: { type: String, required: true, trim: true }, // Mahsulot nomi
    model: { type: String, trim: true }, // Mahsulot modeli
    unit: { type: String, enum: ["kg", "dona", "litr"], required: true }, // O‘lchov birligi
    quantity: { type: Number, required: true, min: 0 }, // Miqdor (kg/dona/litr)
    unit_price: { type: Number, min: 0 }, // Avtomatik hisoblanadi (total_price / quantity)
    total_price: { type: Number, required: true, min: 0 }, // Umumiy narx (UZS yoki USD)
    sell_price: { type: Number, required: true, min: 0 }, // Sotish narxi (1 dona/kg/litr)
    currency: { type: String, enum: ["UZS", "USD"], required: true }, // Valyuta turi
    partiya_number: { type: Number, required: true }, // Partiya raqami

    // To'lov ma'lumotlari
    paid_amount: { type: Number, default: 0, min: 0 }, // To‘langan summa
    remaining_debt: { type: Number, default: 0, min: 0 }, // Qolgan qarz

    // Import bilan bog‘lanish
    import_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Import",
      required: true,
    },

    // Kimdan kelgani
    supplier_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    note: { type: String, trim: true },
  },
  { timestamps: true }
);

// 🔄 Avtomatik hisoblashlar
storeSchema.pre("save", function (next) {
  // 1 kg/dona narxini avtomatik hisoblash
  if (this.quantity > 0 && this.total_price > 0) {
    this.unit_price = Number((this.total_price / this.quantity).toFixed(2));
  }

  // Qolgan qarz hisoblash
  this.remaining_debt = Math.max(this.total_price - (this.paid_amount || 0), 0);

  next();
});

// 🔍 Indekslar
storeSchema.index({ product_name: 1 });
storeSchema.index({ supplier_id: 1, createdAt: -1 });
storeSchema.index({ import_id: 1, partiya_number: 1 });

module.exports = mongoose.model("Store", storeSchema);
