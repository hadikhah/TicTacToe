'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2 } from 'lucide-react';

export default function AdminPage() {
  const [games, setGames] = useState<any[]>([]);
  const [activeRooms, setActiveRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Since middleware protects /admin, we can use the same auth header for the API 
  // or handle it implicitly if requested directly from the browser. But wait, 
  // client-side fetch won't send the basic auth implicitly unless it's same-origin... wait, it will 
  // send it if the user has already entered it in the browser prompt.
  
  const fetchData = async () => {
    setLoading(true);
    try {
      const [gamesRes, roomsRes] = await Promise.all([
        fetch('/api/admin/games'),
        fetch('/api/admin/active-rooms')
      ]);
      if (gamesRes.ok && roomsRes.ok) {
        setGames(await gamesRes.json());
        setActiveRooms(await roomsRes.json());
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;
    setTimeout(() => {
      if (mounted) fetchData();
    }, 0);
    return () => { mounted = false; };
  }, []);

  const clearGames = async () => {
    if (!confirm('Are you sure you want to clear all history?')) return;
    try {
      await fetch('/api/admin/games', { method: 'DELETE' });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading && games.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const xWins = games.filter(g => g.winner === 'X').length;
  const oWins = games.filter(g => g.winner === 'O').length;
  const draws = games.filter(g => g.winner === 'draw').length;

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Admin Dashboard</h1>
            <p className="text-slate-500 mt-1">Manage game sessions and view statistics.</p>
          </div>
          <Button variant="destructive" onClick={clearGames}>
            <Trash2 className="w-4 h-4 mr-2" />
            Clear Game History
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Total Games</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{games.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">X Wins</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{xWins}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">O Wins</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{oWins}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Draws</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{draws}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Game History</CardTitle>
              <CardDescription>Recently finished games recorded in the database.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200 uppercase">
                    <tr>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">Room</th>
                      <th className="px-4 py-3">Winner</th>
                      <th className="px-4 py-3">Moves</th>
                      <th className="px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.slice(0, 50).map((game) => (
                      <tr key={game.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium">{game.id}</td>
                        <td className="px-4 py-3 text-slate-600">{game.roomId.split('_').slice(1).join('_')}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            game.winner === 'X' ? 'bg-indigo-100 text-indigo-700' : 
                            game.winner === 'O' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {game.winner.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 truncate max-w-[150px]">
                          {game.moves}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {new Date(game.endTime).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {games.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500 italic">No games found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active Rooms</CardTitle>
              <CardDescription>Rooms currently held in server memory.</CardDescription>
            </CardHeader>
            <CardContent>
              {activeRooms.length === 0 ? (
                <p className="text-sm text-slate-500 italic text-center py-8">No active rooms.</p>
              ) : (
                <div className="space-y-4">
                  {activeRooms.map((room) => (
                    <div key={room.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-slate-900">{room.id.split('_').slice(1).join('_')}</span>
                        <span className="text-xs bg-white border border-slate-200 px-2 py-1 rounded-full text-slate-500">
                          {room.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 space-y-1">
                        <div>Players: {room.players.length}</div>
                        {room.bot && <div className="text-indigo-600 font-medium tracking-tight">Bot Match</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
