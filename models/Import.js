const mongoose = require("mongoose");

// Har bir mahsulot uchun schema
const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true }, // Mahsulot nomi
    model: { type: String, trim: true },
    unit: { type: String, enum: ["kg", "dona", "litr"], required: true }, // O'lchov
    quantity: { type: Number, required: true, min: 0 }, // Miqdor
    total_price: { type: Number, required: true, min: 0 }, // Jami narx (USD yoki UZS)
    unit_price: { type: Number, min: 0 }, // Avto hisoblanadi (UZS)
    currency: { type: String, enum: ["UZS", "USD"], required: true },
    sell_price: { type: Number, required: true, min: 0 }, // Sotish narxi (UZS)
  },
  { _id: false }
);

// Import kirimi uchun schema
const importSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    }, // Kimdan kelgan

    products: {
      type: [productSchema],
      validate: {
        validator: (arr) => arr.length > 0,
        message: "Kamida bitta mahsulot bo‘lishi shart.",
      },
    },

    usd_to_uzs_rate: { type: Number, required: true, min: 0 }, // Kurs

    total_amount_uzs: { type: Number, default: 0, min: 0 }, // Jami summa (UZS)
    paid_amount: { type: Number, default: 0, min: 0 }, // To‘langan
    remaining_debt: { type: Number, default: 0, min: 0 }, // Qarz

    partiya_number: { type: Number, required: true, min: 1 }, // Partiya raqami
  },
  { timestamps: true }
);

// Avtomatik hisoblash
importSchema.pre("save", function (next) {
  // Har bir mahsulot uchun unit_price ni hisoblash (UZS da)
  this.products.forEach((p) => {
    if (p.total_price && p.quantity > 0) {
      if (p.currency === "USD") {
        p.unit_price = Number(
          ((p.total_price * this.usd_to_uzs_rate) / p.quantity).toFixed(2)
        );
      } else {
        p.unit_price = Number((p.total_price / p.quantity).toFixed(2));
      }
    }
  });

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
