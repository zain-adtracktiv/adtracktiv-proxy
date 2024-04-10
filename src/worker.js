import { parse } from 'cookie';
import { Client } from '@neondatabase/serverless';

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		const matcher = /^\/(api|_next\/static|_next\/image|favicon\.ico).*/;
		if (matcher.test(url.pathname)) {
			// We can handle assets and API routes here
			return fetch(`https://www.marketintelgpt.com/${url.pathname}`);
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

		const response = await fetch(`https://www.marketintelgpt.com/${url.pathname}`);
		let html = await response.text();

		if (user.feature_flag) {
			html = html.replace('This is a headline', 'This is a headline from Cloudflare Worker');
		}

		return new Response(html, {
			headers: {
				'content-type': 'text/html;charset=UTF-8',
			},
		});
	},
};
