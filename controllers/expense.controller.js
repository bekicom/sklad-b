const ExpenseCategory = require("../models/Expense");

// ===================== CATEGORY CRUD =====================

// Barcha kategoriyalarni olish
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await ExpenseCategory.find();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Kategoriya yaratish
exports.createCategory = async (req, res) => {
  try {
    const category = new ExpenseCategory({ name: req.body.name });
    await category.save();
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Kategoriya ichiga xarajat qo‘shish
exports.addExpense = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { amount, note } = req.body;

    const category = await ExpenseCategory.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Kategoriya topilmadi" });
    }

    category.expenses.push({ amount, note });
    await category.save();

    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ===================== OLD-STYLE EXPENSE CRUD =====================

// Barcha xarajatlarni olish
exports.getAllExpenses = async (req, res) => {
  try {
    const categories = await ExpenseCategory.find();
    const expenses = categories.flatMap((cat) =>
      cat.expenses.map((exp) => ({
        ...exp.toObject(),
        category: cat.name,
      }))
    );
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ID orqali bitta xarajatni olish
exports.getExpenseById = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await ExpenseCategory.findOne({
      "expenses._id": id,
    });

    if (!category) {
      return res.status(404).json({ message: "Xarajat topilmadi" });
    }

    const expense = category.expenses.id(id);
    res.json({ ...expense.toObject(), category: category.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Xarajat yaratish (kategoriya ko‘rsatib)
exports.createExpense = async (req, res) => {
  try {
    const { categoryId, amount, note } = req.body;

    const category = await ExpenseCategory.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Kategoriya topilmadi" });
    }

    category.expenses.push({ amount, note });
    await category.save();

    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Xarajatni yangilash
exports.updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, note } = req.body;

    const category = await ExpenseCategory.findOne({
      "expenses._id": id,
    });

    if (!category) {
      return res.status(404).json({ message: "Xarajat topilmadi" });
    }

    const expense = category.expenses.id(id);
    if (amount !== undefined) expense.amount = amount;
    if (note !== undefined) expense.note = note;

    await category.save();

    res.json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Xarajatni o‘chirish
exports.deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await ExpenseCategory.findOne({
      "expenses._id": id,
    });

    if (!category) {
      return res.status(404).json({ message: "Xarajat topilmadi" });
    }

    category.expenses.id(id).remove();
    await category.save();

    res.json({ message: "Xarajat o‘chirildi" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
