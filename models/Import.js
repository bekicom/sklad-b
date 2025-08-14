// models/Import.js
const mongoose = require("mongoose");

// ✅ TUZATILDI: Har bir mahsulot uchun schema (Store modeliga moslashtirilgan)
const productSchema = new mongoose.Schema(
  {
    product_name: { type: String, required: true, trim: true }, // ✅ TUZATILDI: product_name ishlatiladi
    model: { type: String, trim: true },
    unit: { type: String, enum: ["kg", "dona", "litr"], required: true }, // O'lchov
    quantity: { type: Number, required: true, min: 0 }, // Miqdor

    unit_price: { type: Number, required: true, min: 0 }, // ✅ TUZATILDI: unit_price qo'shildi
    sell_price: { type: Number, required: true, min: 0 }, // Sotish narxi (1 dona/kg)

    total_price: { type: Number, required: true, min: 0 }, // Jami kelish narxi
    currency: { type: String, enum: ["UZS", "USD"], required: true }, // Valyuta turi
  },
  { _id: false }
);

// Import kirimi uchun schema
const importSchema = new mongoose.Schema(
  {
    supplier_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    }, // ✅ TUZATILDI: supplier_id ishlatiladi (client emas)

    products: {
      type: [productSchema],
      validate: {
        validator: (arr) => arr.length > 0,
        message: "Kamida bitta mahsulot bo'lishi shart.",
      },
    },

    usd_to_uzs_rate: { type: Number, required: true, min: 0 }, // Kurs

    total_amount_uzs: { type: Number, default: 0, min: 0 }, // Jami summa (UZS)
    paid_amount: { type: Number, default: 0, min: 0 }, // To'langan
    remaining_debt: { type: Number, default: 0, min: 0 }, // Qarz

    partiya_number: { type: Number, required: true, min: 1 }, // Partiya raqami
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

// Avtomatik umumiy summa va qarz hisoblash
importSchema.pre("save", function (next) {
  // Umumiy summa (UZS)
  this.total_amount_uzs = this.products.reduce((sum, p) => {
    if (p.currency === "USD") {
      return sum + p.total_price * this.usd_to_uzs_rate;
    }
    return sum + p.total_price;
  }, 0);

  // Qolgan qarzni hisoblash
  this.remaining_debt = Number(
    (this.total_amount_uzs - (this.paid_amount || 0)).toFixed(2)
  );

  next();
});

module.exports = mongoose.model("Import", importSchema);
