import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler";

import authRoutes from "./routes/auth.routes";
import kycRoutes from "./routes/kyc.routes";
import walletRoutes from "./routes/wallet.routes";
import sportsRoutes from "./routes/sports.routes";
import betsRoutes from "./routes/bets.routes";
import gamesRoutes from "./routes/games.routes";
import responsibleGamblingRoutes from "./routes/responsibleGambling.routes";
import adminRoutes from "./routes/admin.routes";
import supportRoutes from "./routes/support.routes";
import colorGameRoutes from "./routes/colorGame.routes";
import aviatorRoutes from "./routes/aviator.routes";
import chickenRoadRoutes from "./routes/chickenRoad.routes";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/auth", authRoutes);
app.use("/kyc", kycRoutes);
app.use("/wallet", walletRoutes);
app.use("/sports", sportsRoutes);
app.use("/bets", betsRoutes);
app.use("/games", gamesRoutes);
app.use("/responsible-gambling", responsibleGamblingRoutes);
app.use("/admin", adminRoutes);
app.use("/support", supportRoutes);
app.use("/color-game", colorGameRoutes);
app.use("/aviator", aviatorRoutes);
app.use("/chicken-road", chickenRoadRoutes);

app.use(errorHandler);
