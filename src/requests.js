async function verifyRequest(request) {
	// const correlationId = request.correlationId;

	const body = await request.json();

	const url = new URL(request.url);
	const urlParams = url.searchParams;

	const location = body.location;

	if (!location || !isValidUrl(location)) {
		console.log(`[${correlationId}] Bad Request: malformed h parameter in ${request.url}`);
		return new Response('Bad Request', {
			status: 400,
		});
	}

	const clientLocation = new URL(location);
	const hostname = request.headers.get('host');

	const rootHost = extractRootDomain(hostname);
	const clientRootHost = extractRootDomain(clientLocation.hostname);

	if (rootHost !== clientRootHost) {
		console.log(`[${correlationId}] Bad Request: not first party ${rootHost} !== ${clientRootHost}`);
		return new Response('Bad Request', {
			status: 400,
		});
	}

	return { correlationId, clientH, clientLocation, rootHost, clientDetails, urlParams };
}
