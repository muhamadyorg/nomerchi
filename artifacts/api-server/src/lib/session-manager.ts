import type { Response } from "express";

// userId → active SSE connections
const connections = new Map<number, Set<Response>>();

export function addConnection(userId: number, res: Response) {
  if (!connections.has(userId)) connections.set(userId, new Set());
  connections.get(userId)!.add(res);
}

export function removeConnection(userId: number, res: Response) {
  connections.get(userId)?.delete(res);
  if (connections.get(userId)?.size === 0) connections.delete(userId);
}

export function kickUser(userId: number) {
  const conns = connections.get(userId);
  if (!conns) return;
  for (const res of conns) {
    try {
      res.write(`data: ${JSON.stringify({ kicked: true })}\n\n`);
      res.end();
    } catch {}
  }
  connections.delete(userId);
}
