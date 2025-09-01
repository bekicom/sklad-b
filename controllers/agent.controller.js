// controllers/agent.controller.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Agent = require("../models/Agent");

// ADMIN: Agent yaratish (ism, tel, login, parol)
// Body: { name, phone, login, password }
exports.createAgent = async (req, res) => {
  try {
    const { name, phone, login, password } = req.body;

    if (!name || !phone || !login || !password) {
      return res
        .status(400)
        .json({ message: "name, phone, login, password majburiy" });
    }

    const existsPhone = await Agent.findOne({ phone });
    if (existsPhone)
      return res.status(409).json({ message: "Bu telefon band" });

    const existsLogin = await Agent.findOne({ login });
    if (existsLogin) return res.status(409).json({ message: "Bu login band" });

    const hashed = await bcrypt.hash(password, 10);

    const agent = await Agent.create({
      name,
      phone,
      login,
      password: hashed,
      is_active: true,
    });

    // Parolni qaytarmaymiz
    const safe = (({ _id, name, phone, login, is_active, createdAt }) => ({
      _id,
      name,
      phone,
      login,
      is_active,
      createdAt,
    }))(agent.toObject());

    return res.status(201).json({ message: "Agent yaratildi", agent: safe });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Server xatosi", error: err.message });
  }
};

// ADMIN/UMUMIY: Agentlar ro'yxati
exports.listAgents = async (req, res) => {
  try {
    const agents = await Agent.find({}, { password: 0 }); // parolsiz
    return res.json({ agents });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Server xatosi", error: err.message });
  }
};

// ADMIN: Agent ma'lumotini yangilash (parolsiz) — name/phone/login/is_active
exports.updateAgent = async (req, res) => {
  try {
    const { id } = req.params;
    // parolni bu endpointda yangilamaymiz
    if (req.body.password) delete req.body.password;

    // login/phone unikal bo'lsa, xatoni Mongo qaytaradi — lekin avval tekshirib ham olamiz
    if (req.body.login) {
      const existsLogin = await Agent.findOne({
        login: req.body.login,
        _id: { $ne: id },
      });
      if (existsLogin)
        return res.status(409).json({ message: "Bu login allaqachon band" });
    }
    if (req.body.phone) {
      const existsPhone = await Agent.findOne({
        phone: req.body.phone,
        _id: { $ne: id },
      });
      if (existsPhone)
        return res.status(409).json({ message: "Bu telefon allaqachon band" });
    }

    const updated = await Agent.findByIdAndUpdate(id, req.body, {
      new: true,
      projection: { password: 0 },
    });
    if (!updated) return res.status(404).json({ message: "Agent topilmadi" });

    return res.json({ message: "Yangilandi", agent: updated });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Server xatosi", error: err.message });
  }
};

// ADMIN: Agent parolini almashtirish
// Body: { new_password }
exports.resetAgentPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;
    if (!new_password)
      return res.status(400).json({ message: "new_password majburiy" });

    const agent = await Agent.findById(id);
    if (!agent) return res.status(404).json({ message: "Agent topilmadi" });

    const hashed = await bcrypt.hash(new_password, 10);
    agent.password = hashed;
    await agent.save();

    return res.json({ message: "Parol yangilandi" });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Server xatosi", error: err.message });
  }
};

// AGENT: Login (telefon app/webdan)
// Body: { login, password }  -> JWT token qaytaradi
// AGENT: Login
exports.loginAgent = async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password)
      return res.status(400).json({ message: "login va password majburiy" });

    const agent = await Agent.findOne({ login, is_active: true });
    if (!agent)
      return res.status(401).json({ message: "Login yoki parol noto'g'ri" });

    const ok = await bcrypt.compare(password, agent.password);
    if (!ok)
      return res.status(401).json({ message: "Login yoki parol noto'g'ri" });

    // JWT tayyorlash
    const token = jwt.sign(
      { agentId: agent._id, role: "agent" },
      process.env.JWT_SECRET || "dev_secret",
      { expiresIn: "7d" }
    );

    // 🔹 role maydonini qo‘shib yuboramiz
    const safe = (({ _id, name, phone, login, is_active }) => ({
      _id,
      name,
      phone,
      login,
      is_active,
      role: "agent",
    }))(agent.toObject());

    return res.json({ message: "Kirish muvaffaqiyatli", token, agent: safe });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Server xatosi", error: err.message });
  }
};

