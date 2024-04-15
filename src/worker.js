import { parse } from 'cookie';
import { Client } from '@neondatabase/serverless';

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const REDIRECT_URL = 'https://www.marketintelgpt.com';

		const matcher = /^\/(api|_next\/static|_next\/image|favicon\.ico).*/;
		if (matcher.test(url.pathname)) {
			// We can handle assets and API routes here
			return fetch(`${REDIRECT_URL}/${url.pathname}`);
		}

		// Retreive user info from cookie
		const cookie = parse(request.headers.get('Cookie') || '');
		const userId = 1;

		const client = new Client(env.DATABASE_URL);
		await client.connect();

		const { rows } = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
		ctx.waitUntil(client.end()); // this doesn’t hold up the response

		const user = rows[0];
		console.log('User:', user);

		let response = await fetch(`${REDIRECT_URL}/${url.pathname}`);
		response = new Response(response.body, response);
		// Set cookie to enable persistent A/B sessions.
		if (user.feature_flag) {
			response.headers.append('Set-Cookie', `ae=1`);
		}
		return response;
	},
};
