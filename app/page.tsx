'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getSocket } from '../lib/socket';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../components/ui/card';
import { Loader2, Users, Bot, LogOut, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

type Player = { id: string; symbol: 'X' | 'O' };
type Room = {
  id: string;
  players: Player[];
  board: ('X' | 'O' | null)[];
  turn: 'X' | 'O';
  status: 'waiting' | 'playing' | 'finished';
  winner: 'X' | 'O' | 'draw' | null;
  bot?: boolean;
};

export default function GamePage() {
  const [socket, setSocket] = useState<any>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [mySymbol, setMySymbol] = useState<'X' | 'O' | null>(null);
  const [searching, setSearching] = useState(false);
  const [opponentLeft, setOpponentLeft] = useState(false);

  useEffect(() => {
    let mounted = true;
    setTimeout(() => {
      if (!mounted) return;
      const s = getSocket();
      setSocket(s);

      s.on('match_found', (r: Room) => {
        if (mounted) {
          setRoom(r);
          const me = r.players.find((p) => p.id === s.id);
          if (me) setMySymbol(me.symbol);
          setSearching(false);
          setOpponentLeft(false);
        }
      });

      s.on('move_made', (r: Room) => {
        if (mounted) setRoom(r);
      });

      s.on('opponent_left', (r: Room) => {
        if (mounted) {
          setRoom(r);
          setOpponentLeft(true);
        }
      });
    }, 0);

    return () => {
      mounted = false;
      const s = getSocket();
      s.off('match_found');
      s.off('move_made');
      s.off('opponent_left');
    };
  }, []);

  const findMatch = () => {
    if (!socket) return;
    setSearching(true);
    socket.emit('find_match');
  };

  const makeMove = (index: number) => {
    if (!socket || !room || room.status !== 'playing') return;
    if (room.turn !== mySymbol || room.board[index] !== null) return;

    socket.emit('make_move', { roomId: room.id, index, playerSymbol: mySymbol });
  };

  const requestRematch = () => {
    if (!socket || !room) return;
    socket.emit('rematch', { roomId: room.id });
  };

  const leaveRoom = () => {
    if (!socket || !room) return;
    socket.emit('leave_room', { roomId: room.id });
    setRoom(null);
    setMySymbol(null);
    setOpponentLeft(false);
  };

  const getStatusText = () => {
    if (opponentLeft) return "Opponent left the game.";
    if (room?.status === 'finished') {
      if (room.winner === 'draw') return "It's a draw!";
      if (room.winner === mySymbol) return "You won!";
      return "You lost.";
    }
    if (room?.turn === mySymbol) return "Your turn";
    return "Opponent's turn";
  };

  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-slate-50">
        <Card className="w-full max-w-md shadow-xl border-0 ring-1 ring-slate-200">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto bg-indigo-100 w-12 h-12 rounded-full flex items-center justify-center mb-2">
              <Users className="w-6 h-6 text-indigo-600" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Tic-Tac-Toe</CardTitle>
            <CardDescription className="text-base text-slate-500">
              Play against humans or practice against our unbeatable AI.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center pt-4">
            <Button 
              size="lg" 
              className="w-full text-lg h-14" 
              onClick={findMatch} 
              disabled={searching}
            >
              {searching ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Finding Match...
                </>
              ) : (
                "Find Game"
              )}
            </Button>
            {searching && (
              <p className="mt-4 flex items-center text-sm text-slate-500">
                <Bot className="w-4 h-4 mr-2" />
                Bot will join in 3s if no players are found.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-slate-50 flex-col space-y-6">
      <div className="flex justify-between items-center w-full max-w-md">
        <div className="flex items-center space-x-2">
          <span className="text-xl font-bold text-slate-800">Room: {room.id.split('_').pop()}</span>
          {room.bot && <span className="px-2 py-1 bg-slate-200 text-slate-700 rounded-md text-xs font-semibold flex items-center"><Bot className="w-3 h-3 mr-1" /> Bot Match</span>}
        </div>
        <Button variant="ghost" size="sm" onClick={leaveRoom} className="text-slate-500 hover:text-red-600 hover:bg-red-50">
          <LogOut className="w-4 h-4 mr-2" />
          Leave
        </Button>
      </div>

      <Card className="w-full max-w-md shadow-2xl border-0 overflow-hidden">
        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
          <div className="flex items-center space-x-3">
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold transition-colors", mySymbol === 'X' ? "bg-indigo-500" : "bg-slate-700")}>X</div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{mySymbol === 'X' ? 'You' : (room.bot ? 'Bot' : 'Opp')}</span>
              {room.turn === 'X' && room.status === 'playing' && <span className="text-xs text-indigo-300">Evaluating...</span>}
            </div>
          </div>
          <div className="flex items-baseline space-x-4">
             <div className="text-2xl font-black text-slate-400 font-mono">VS</div>
          </div>
          <div className="flex items-center space-x-3 text-right">
            <div className="flex flex-col items-end">
              <span className="text-sm font-medium">{mySymbol === 'O' ? 'You' : (room.bot ? 'Bot' : 'Opp')}</span>
              {room.turn === 'O' && room.status === 'playing' && <span className="text-xs text-indigo-300">Evaluating...</span>}
            </div>
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold transition-colors", mySymbol === 'O' ? "bg-indigo-500" : "bg-slate-700")}>O</div>
          </div>
        </div>

        <CardContent className="p-8">
           <div className="flex justify-center mb-8">
            <div className={cn(
              "px-4 py-1.5 rounded-full text-sm font-bold tracking-wide transition-all",
              room.status === 'finished' ? 
                (room.winner === mySymbol ? "bg-green-100 text-green-700" : (room.winner === 'draw' ? "bg-slate-100 text-slate-700" : "bg-red-100 text-red-700")) 
                : (room.turn === mySymbol ? "bg-indigo-100 text-indigo-700 animate-pulse" : "bg-slate-100 text-slate-500")
            )}>
              {getStatusText()}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 aspect-square max-w-[300px] mx-auto">
            {room.board.map((cell, index) => (
              <button
                key={index}
                onClick={() => makeMove(index)}
                disabled={room.status !== 'playing' || cell !== null || room.turn !== mySymbol}
                className={cn(
                  "bg-slate-100 rounded-lg text-5xl font-black transition-all flex items-center justify-center",
                  !cell && room.status === 'playing' && room.turn === mySymbol && "hover:bg-indigo-50 cursor-pointer",
                  (!cell || room.status !== 'playing' || room.turn !== mySymbol) && "cursor-default",
                  cell === 'X' && "text-indigo-600",
                  cell === 'O' && "text-emerald-500",
                  room.status === 'finished' && room.winner !== 'draw' && room.board[index] === room.winner && "ring-4 ring-green-400 bg-green-50"
                )}
              >
                <AnimatePresence>
                  {cell && (
                    <motion.span
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    >
                      {cell}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            ))}
          </div>
        </CardContent>
        {room.status === 'finished' && (
           <CardFooter className="bg-slate-50 p-6 flex justify-center">
             <Button onClick={requestRematch} className="w-full flex items-center justify-center" size="lg">
               <RotateCcw className="w-5 h-5 mr-2" />
               Play Again
             </Button>
           </CardFooter>
        )}
      </Card>
      
    </div>
  );
}
