import { Router } from 'itty-router';
import { handleInit } from './handleInit.js';
import handleRouter from './handleRouter.js';

const router = Router();

router.get('/i', (request, env, ctx) => handleInit(request, env, ctx));

// router.get('/t/:experiment_id', (request, env, ctx) => handleTestLink(request, env, ctx));

router.get('/r', (request, env, ctx) => handleRouter(request, env, ctx));

router.all('*', () => new Response('Not Found', { status: 404 }));

export default {
	async fetch(request, env, ctx) {
		const requestClone = request.clone();
		requestClone.correlationId = crypto.randomUUID();
		request.correlationId = requestClone.correlationId;
		return router.handle(request, env, ctx);
	},
};
