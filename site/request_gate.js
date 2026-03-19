export function createLatestTaskRunner() {
  let activeToken = 0;

  return async function runLatest(task) {
    const requestToken = ++activeToken;

    try {
      const value = await task();
      if (requestToken !== activeToken) {
        return { stale: true };
      }
      return { stale: false, value };
    } catch (error) {
      if (requestToken !== activeToken) {
        return { stale: true };
      }
      throw error;
    }
  };
}
