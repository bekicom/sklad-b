const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true }, // To'langan summa
    date: { type: Date, default: Date.now }, // To'lov sanasi
    note: { type: String, default: "Qarz to'lovi" },
  },
  { _id: false }
);

const importHistorySchema = new mongoose.Schema(
  {
    import_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Import",
      required: true,
    },
    products: [
      {
        product_name: { type: String, required: true },
        model: { type: String },
        quantity: { type: Number, required: true },
        unit: { type: String, required: true },
        total_price: { type: Number, required: true },
        currency: { type: String, enum: ["UZS", "USD"], required: true },
      },
    ],
    partiya_number: { type: Number, required: true },
    delivery_date: { type: Date, required: true },
    total_amount_uzs: { type: Number, required: true },
  },
  { _id: false }
);

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    address: { type: String },

    totalDebt: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    remainingDebt: { type: Number, default: 0 },

    paymentHistory: [paymentSchema],

    // 🔹 Importlar tarixi (history)
    importsHistory: [importHistorySchema],
  },
  {
    timestamps: true,
    collection: "clients", // ✅ Collection nomini aniq belgilaymiz
  }
);

// 🔹 Qarz va qolgan summani avtomatik hisoblash
clientSchema.pre("save", function (next) {
  this.remainingDebt = this.totalDebt - this.totalPaid;
  next();
});

module.exports = mongoose.model("Client", clientSchema);
