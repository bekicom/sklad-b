const Expense = require("../models/Expense");

// Barcha xarajatlarni olish
exports.getAllExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find().sort({ date: -1 });
    res.json({ success: true, expenses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Bitta xarajatni ID bo‘yicha olish
exports.getExpenseById = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense)
      return res
        .status(404)
        .json({ success: false, message: "Expense not found" });
    res.json({ success: true, expense });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Yangi xarajat qo'shish
exports.createExpense = async (req, res) => {
  try {
    const { amount, reason } = req.body;
    if (!reason || !amount) {
      return res
        .status(400)
        .json({ success: false, message: "Reason and amount are required" });
    }
    const expense = await Expense.create({ amount, reason });
    res.json({ success: true, expense });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Xarajatni yangilash
exports.updateExpense = async (req, res) => {
  try {
    const { amount, reason } = req.body;
    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      { amount, reason },
      { new: true }
    );
    if (!expense)
      return res
        .status(404)
        .json({ success: false, message: "Expense not found" });
    res.json({ success: true, expense });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Xarajatni o‘chirish
exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense)
      return res
        .status(404)
        .json({ success: false, message: "Expense not found" });
    res.json({ success: true, message: "Expense deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
