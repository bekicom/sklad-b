const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    address: { type: String },
    totalDebt: { type: Number, default: 0 }, // umumiy qarz
    totalPaid: { type: Number, default: 0 }, // umumiy to‘langan summa (yangi qo‘shildi)
    remainingDebt: { type: Number, default: 0 }, // qolgan qarz (yangi qo‘shildi)

    // ✅ To'lov tarixi
    paymentHistory: [
      {
        amount: { type: Number, required: true }, // to‘langan summa
        date: { type: Date, default: Date.now }, // to‘lov sanasi
        note: { type: String, default: "Qarz to'lovi" },
      },
    ],
  },
  { timestamps: true }
);

// 🔹 Qarz yoki to‘lov o‘zgarganda qolgan qarzni avtomatik hisoblash
clientSchema.pre("save", function (next) {
  this.remainingDebt = this.totalDebt - this.totalPaid;
  next();
});

module.exports = mongoose.model("Client", clientSchema);
