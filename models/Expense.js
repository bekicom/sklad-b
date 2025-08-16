const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  reason: { type: String, required: false },
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Expense", expenseSchema);
