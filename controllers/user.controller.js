// controllers/user.controller.js
const User = require("../models/User");
const jwt = require("jsonwebtoken");

// JWT token yaratish (role bilan)
const signToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role }, // 🔑 role ham token ichida
    process.env.JWT_SECRET || "dev_secret",
    { expiresIn: "7d" }
  );

// Parolsiz user qaytarish
const sanitizeUser = (u) => {
  const obj = u.toObject ? u.toObject() : u;
  const { password, __v, ...rest } = obj;
  return rest;
};

// 🔐 Ro'yxatdan o'tish
exports.registerUser = async (req, res) => {
  try {
    const { name, login, password /*, role*/ } = req.body;

    if (!name || !login || !password) {
      return res
        .status(400)
        .json({ message: "name, login, password majburiy" });
    }

    const normalizedLogin = String(login).trim();
    const existing = await User.findOne({ login: normalizedLogin });
    if (existing) {
      return res.status(400).json({ message: "Bu login allaqachon mavjud" });
    }

    // User schemada default role bor (masalan: "afitsant")
    const user = new User({
      name: String(name).trim(),
      login: normalizedLogin,
      password, // hashni model pre('save') qiladi
      // role: role  // agar frontdan rol bermasangiz, schema default ishlaydi
    });
    await user.save();

    const token = signToken(user);
    return res
      .status(201)
      .json({
        message: "Ro'yxatdan o'tish muvaffaqiyatli",
        token,
        user: sanitizeUser(user),
      });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Ro'yxatdan o'tishda xatolik", error: err.message });
  }
};

// 🔐 Login qilish
exports.loginUser = async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ message: "login va password majburiy" });
    }

    const normalizedLogin = String(login).trim();
    const user = await User.findOne({ login: normalizedLogin });
    if (!user) {
      return res.status(404).json({ message: "Login topilmadi" });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Parol noto'g'ri" });
    }

    const token = signToken(user);
    return res
      .status(200)
      .json({
        message: "Kirish muvaffaqiyatli",
        token,
        user: sanitizeUser(user),
      });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Login xatoligi", error: err.message });
  }
};
