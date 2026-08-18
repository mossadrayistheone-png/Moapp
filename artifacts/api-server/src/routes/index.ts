import { Router, type IRouter } from "express";
import healthRouter from "./health";
import moRouter from "./mo";
import voiceRouter from "./voice";
import apkRouter from "./apk";

const router: IRouter = Router();

router.use(healthRouter);
router.use(apkRouter);
router.use(moRouter);
router.use(voiceRouter);

export default router;
