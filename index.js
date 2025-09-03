const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const http = require("http"); // 📌 qo‘shildi
const { Server } = require("socket.io"); // 📌 qo‘shildi

// 📌 .env faylni yuklash
dotenv.config();

// 📌 App yaratish
const app = express();

// 📌 Middlewarelar
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// 📌 MongoDBga ulanish
const connectDB = require("./config/db");
connectDB();

// 📌 Main Router
const mainRouter = require("./routes/mainRouter");
app.use("/api", mainRouter);

// 📌 Xatoliklar uchun universal middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res
    .status(500)
    .json({ message: "Serverda xatolik yuz berdi", error: err.message });
});

// 📌 HTTP server va Socket.IO ulash
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // 🔐 frontend domenini yozib qo‘ysang ham bo‘ladi
    methods: ["GET", "POST"],
  },
});

// 📌 Socket ulanish
io.on("connection", (socket) => {
  console.log("🟢 Client ulandi:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔴 Client chiqdi:", socket.id);
  });
});

// 📌 Boshqa fayllar ichida foydalanish uchun io’ni eksport qilamiz
module.exports = { io };

// 📌 Serverni ishga tushirish
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server ${PORT}-portda ishlamoqda`);
});
