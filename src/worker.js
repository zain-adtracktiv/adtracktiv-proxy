import { parse } from 'cookie';
import { Client } from '@neondatabase/serverless';

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const REDIRECT_URL = 'https://www.marketintelgpt.com';

		const matcher = /^\/(api|_next\/static|_next\/image|favicon\.ico).*/;
		if (matcher.test(url.pathname)) {
			// We can handle assets and API routes here
			return fetch(`${REDIRECT_URL}/${url.pathname}?${url.searchParams.toString()}`);
		}

		const client = new Client(env.DATABASE_URL);
		await client.connect();

		if (url.pathname.startsWith('/r/')) {
			const rotatorName = url.pathname.split('/')[2];
			const {
				rows: [rotator],
			} = await client.query('SELECT * FROM rotator WHERE name = $1', [rotatorName]);
			console.log('Rotator:', rotator);

			console.log('Params', url.searchParams.toString());
			const params = url.searchParams.toString();

			let headers = {
				'Content-Type': 'application/javascript',
				'Cache-Control': 'max-age=3600',
				'Access-Control-Allow-Origin': '*',
			};

			const cookie = `ae=1; HttpOnly; Secure; SameSite=None; Path=/; Domain=.marketintelgpt.com; Max-Age=31536000;`;
			headers['Cookie'] = cookie;

			console.log('Headers:', headers);

			let response = await fetch(`${REDIRECT_URL}/${rotator.url}${params ? `?${params}` : ''}`, {
				headers,
			});
			response = new Response(response.body, response);
			// Set cookie to enable persistent A/B sessions.
			response.headers.append('Set-Cookie', `ae=1; HttpOnly; Secure; SameSite=None; Path=/; Domain=.marketintelgpt.com; Max-Age=31536000;`);
			return response;
		}

		// Retreive user info from cookie
		const cookie = parse(request.headers.get('Cookie') || '');
		const userId = 1;

		const { rows } = await client.query('SELECT * FROM test_user WHERE id = $1', [userId]);
		ctx.waitUntil(client.end()); // this doesn’t hold up the response

		const user = rows[0];
		console.log('User:', user);

		let response = await fetch(`${REDIRECT_URL}/${url.pathname}`);
		response = new Response(response.body, response);
		// Set cookie to enable persistent A/B sessions.
		if (user.feature_flag) {
			response.headers.append('Set-Cookie', `ae=1; HttpOnly; Secure; SameSite=None; Path=/; Domain=.marketintelgpt.com; Max-Age=31536000;`);
		}
		return response;
	},
};
