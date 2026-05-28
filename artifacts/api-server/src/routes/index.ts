import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import categoriesRouter from "./categories";
import pointsRouter from "./points";
import vizitkaRouter from "./vizitka";
import savedRouter from "./saved";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/categories", categoriesRouter);
router.use("/points", pointsRouter);
router.use("/vizitka", vizitkaRouter);
router.use("/saved", savedRouter);
router.use("/settings", settingsRouter);

export default router;
