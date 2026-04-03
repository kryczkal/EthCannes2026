async function getJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

function create(defaults = {}) {
  return {
    get(url, init = {}) {
      return getJson(url, { ...defaults, ...init });
    }
  };
}

module.exports = {
  getJson,
  create
};
