import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler";

import authRoutes from "./routes/auth.routes";
import kycRoutes from "./routes/kyc.routes";
import walletRoutes from "./routes/wallet.routes";
import gamesRoutes from "./routes/games.routes";
import responsibleGamblingRoutes from "./routes/responsibleGambling.routes";
import adminRoutes from "./routes/admin.routes";
import supportRoutes from "./routes/support.routes";
import aviatorRoutes from "./routes/aviator.routes";
import chickenRoadRoutes from "./routes/chickenRoad.routes";
import minesRoutes from "./routes/mines.routes";
import sevenUpDownRoutes from "./routes/sevenUpDown.routes";
import plinkoRoutes from "./routes/plinko.routes";
import dragonTigerRoutes from "./routes/dragonTiger.routes";
import vortexRoutes from "./routes/vortex.routes";
import andarBaharRoutes from "./routes/andarBahar.routes";
import teenPattiRoutes from "./routes/teenPatti.routes";
import cricketXRoutes from "./routes/cricketX.routes";
import jhandiMundaRoutes from "./routes/jhandiMunda.routes";
import rouletteRoutes from "./routes/roulette.routes";
import k3Routes from "./routes/k3.routes";
import winGoRoutes from "./routes/winGo.routes";
import fiveDRoutes from "./routes/fiveD.routes";
import trxRoutes from "./routes/trx.routes";
import baccaratRoutes from "./routes/baccarat.routes";
import slotRoutes from "./routes/slot.routes";
import acesRoutes from "./routes/aces.routes";
import diceRoutes from "./routes/dice.routes";
import limboRoutes from "./routes/limbo.routes";
import blackjackRoutes from "./routes/blackjack.routes";
import kenoRoutes from "./routes/keno.routes";
import hiloRoutes from "./routes/hilo.routes";
import dragonTowerRoutes from "./routes/dragonTower.routes";
import videoPokerRoutes from "./routes/videoPoker.routes";
import diamondsRoutes from "./routes/diamonds.routes";
import pumpRoutes from "./routes/pump.routes";
import coinFlipRoutes from "./routes/coinFlip.routes";
import { closeOutRetiredGames } from "./services/retiredGamesCloseout";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/auth", authRoutes);
app.use("/kyc", kycRoutes);
app.use("/wallet", walletRoutes);
app.use("/games", gamesRoutes);
app.use("/responsible-gambling", responsibleGamblingRoutes);
app.use("/admin", adminRoutes);
app.use("/support", supportRoutes);
app.use("/aviator", aviatorRoutes);
app.use("/chicken-road", chickenRoadRoutes);
app.use("/mines", minesRoutes);
app.use("/seven-up-down", sevenUpDownRoutes);
app.use("/plinko", plinkoRoutes);
app.use("/dragon-tiger", dragonTigerRoutes);
app.use("/vortex", vortexRoutes);
app.use("/andar-bahar", andarBaharRoutes);
app.use("/teen-patti", teenPattiRoutes);
app.use("/cricket-x", cricketXRoutes);
app.use("/jhandi-munda", jhandiMundaRoutes);
app.use("/roulette", rouletteRoutes);
app.use("/k3", k3Routes);
app.use("/wingo", winGoRoutes);
app.use("/5d", fiveDRoutes);
app.use("/trx", trxRoutes);
app.use("/baccarat", baccaratRoutes);
app.use("/slot", slotRoutes);
app.use("/aces", acesRoutes);
app.use("/dice", diceRoutes);
app.use("/limbo", limboRoutes);
app.use("/blackjack", blackjackRoutes);
app.use("/keno", kenoRoutes);
app.use("/hilo", hiloRoutes);
app.use("/dragon-tower", dragonTowerRoutes);
app.use("/video-poker", videoPokerRoutes);
app.use("/diamonds", diamondsRoutes);
app.use("/pump", pumpRoutes);
app.use("/coinflip", coinFlipRoutes);

app.use(errorHandler);

// Retired games (the original Win Go, the sportsbook): settle / refund
// anything still open on them. Idempotent, so every cold start is harmless.
closeOutRetiredGames().catch((err) => console.error("Retired games close-out failed", err));
