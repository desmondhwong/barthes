// A partially loaded source cannot establish that an unseen page was removed.
// Keep its remembered visits/edges until a complete source can reconcile them.
export function retainUnloaded(previous, current, partial) {
  if (!partial || previous?.version !== 3) return current;
  const ids = values => Array.isArray(values) ? values.filter(id => typeof id === 'string' && id.length <= 512).slice(0, 50000) : [];
  const unique = values => [...new Set(values)];
  const edges = new Map();
  for (const edge of (Array.isArray(previous.edges) ? previous.edges : []).slice(0, 100000)) {
    if (edge && typeof edge.from === 'string' && typeof edge.to === 'string' && typeof edge.traversed === 'boolean') {
      edges.set(JSON.stringify([edge.from, edge.to]), { from: edge.from, to: edge.to, traversed: edge.traversed });
    }
  }
  for (const edge of current.edges) edges.set(JSON.stringify([edge.from, edge.to]), { ...edge });
  return {
    ...current,
    visited: unique([...ids(previous.visited), ...current.visited]),
    visible: unique([...ids(previous.visible), ...current.visible]),
    edges: [...edges.values()],
  };
}
