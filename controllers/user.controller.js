const User = require("../models/User");
const jwt = require("jsonwebtoken");

// JWT token yaratish
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// 🔐 Ro'yxatdan o'tish
exports.registerUser = async (req, res) => {
  try {
    const { name, login, password } = req.body;

    const existing = await User.findOne({ login });
    if (existing) {
      return res.status(400).json({ message: "Bu login allaqachon mavjud" });
    }

    const user = new User({ name, login, password });
    await user.save();

    const token = generateToken(user._id);

    res.status(201).json({ token, user });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Ro'yxatdan o'tishda xatolik", error: err.message });
  }
};

// 🔐 Login qilish
exports.loginUser = async (req, res) => {
  try {
    const { login, password } = req.body;

    const user = await User.findOne({ login });
    if (!user) {
      return res.status(404).json({ message: "Login topilmadi" });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Parol noto'g'ri" });
    }

    const token = generateToken(user._id);
    res.status(200).json({ token, user });
  } catch (err) {
    res.status(500).json({ message: "Login xatoligi", error: err.message });
  }
};
