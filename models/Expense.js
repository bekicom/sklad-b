const mongoose = require("mongoose");

const dailyExpenseSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      default: Date.now,
    },
    amount: {
      type: Number,
      required: true,
    },
    note: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const expenseCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    expenses: {
      type: [dailyExpenseSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ExpenseCategory", expenseCategorySchema);
