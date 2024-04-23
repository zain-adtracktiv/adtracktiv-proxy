import { Client } from '@neondatabase/serverless';
import { Router } from 'itty-router';
import { parse } from 'cookie';

// Create a new router
const router = Router();

// This will be replaced with the subdomain where the pages are hosted (e.g ain)
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

	const url = new URL(body.location);
	const isRotatorUrl = url.pathname.startsWith('/r/');

	const cookie = parse(request.headers.get('Cookie') || '');

	let redirectUrl;
	if (isRotatorUrl) {
		redirectUrl = cookie['redirectUrl'];
	}

	const variations = JSON.parse(cookie['variations']);
	const variation = variations ? variations.find((v) => v.url === (redirectUrl || body.location)) : null;

	const client = new Client(env.DATABASE_URL);
	await client.connect();

	await client.query(`INSERT INTO event (name, location, rotator_url, page_variation_name) VALUES ($1, $2, $3, $4)`, [
		body.eventName,
		redirectUrl || body.location,
		redirectUrl && body.location,
		variation?.name,
	]);

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

export default { ...router };
