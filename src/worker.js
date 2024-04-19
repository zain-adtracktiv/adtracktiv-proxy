import { Client } from '@neondatabase/serverless';
import { Router } from 'itty-router';

// Create a new router
const router = Router();

const REDIRECT_URL = 'https://www.marketintelgpt.com';

router.get('/r/*', async (request, env, ctx) => {
	const userId = 1;

	const url = new URL(request.url);
	const params = url.searchParams.toString();

	const client = new Client(env.DATABASE_URL);
	await client.connect();

	const {
		rows: [user],
	} = await client.query('SELECT * FROM test_user WHERE id = $1', [userId]);

	const cookie = `ae=${user.feature_flag ? 1 : 0}; HttpOnly; Secure; SameSite=None; Path=/; Domain=.marketintelgpt.com; Max-Age=31536000;`;

	const headers = {
		'Content-Type': 'application/javascript',
		'Cache-Control': 'max-age=3600',
		'Access-Control-Allow-Origin': '*',
		Cookie: cookie,
	};

	const rotatorName = url.pathname.split('/')[2];
	const {
		rows: [rotator],
	} = await client.query('SELECT * FROM rotator WHERE name = $1', [rotatorName]);

	let response = await fetch(`${REDIRECT_URL}/${rotator.url}${params ? `?${params}` : ''}`, {
		headers,
	});

	response = new Response(response.body, response);
	response.headers.append('Set-Cookie', cookie);

	ctx.waitUntil(client.end());
	return response;
});

router.post('/e', async (request, env, ctx) => {
	const body = await request.json();

	const client = new Client(env.DATABASE_URL);
	await client.connect();

	await client.query(`INSERT INTO event (name, location) VALUES ($1, $2)`, [body.name, body.location]);

	ctx.waitUntil(client.end());

	return Response.json({
		success: true,
	});
});

router.all('*', (request) => {
	const url = new URL(request.url);
	const params = url.searchParams.toString();

	return fetch(`${REDIRECT_URL}/${url.pathname}${params ? `?${params}` : ''}`);
});

export default { ...router }; // this looks pointless, but trust us
