import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { getPopupImage, listLivePopups } from "../services/popupService";

// Public: the app fetches these before the player is necessarily logged in.
const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await listLivePopups());
  })
);

router.get(
  "/:id/image",
  asyncHandler(async (req, res) => {
    const { image, mimeType } = await getPopupImage(req.params.id);
    res.setHeader("Content-Type", mimeType);
    // The URL carries ?v=<updatedAt>, so a given URL's bytes never change.
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(Buffer.from(image));
  })
);

export default router;
