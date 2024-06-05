export const deepMerge = (t, s) => {
	Object.keys(s).forEach((k) => {
		s[k] && typeof s[k] === 'object' ? (t[k] || (t[k] = {}), deepMerge(t[k], s[k])) : (t[k] = s[k]);
	});
	return t;
};

export function extractRootDomain(origin) {
	let noProtocol = origin.replace(/^https?:\/\//, '');
	noProtocol = noProtocol.endsWith('/') ? noProtocol.slice(0, -1) : noProtocol;
	let parts = noProtocol.split('.');
	if (parts.length > 2) {
		return parts.slice(1).join('.');
	} else {
		return noProtocol;
	}
}
