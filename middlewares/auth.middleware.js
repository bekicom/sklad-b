// middlewares/auth.middleware.js
const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(403).json({ message: "Token topilmadi" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: "Token noto‘g‘ri" });
    req.user = decoded;
    next();
  });
}

module.exports = { verifyToken };
