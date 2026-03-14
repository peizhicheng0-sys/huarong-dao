import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Trash2, Play, Pause, StepForward } from 'lucide-react';
import { Block, getMoves } from './gameLogic';
import SolverWorker from './solver.worker.ts?worker';

const DEFAULT_BLOCKS: Block[] = [
    { id: 1, w: 1, h: 2, x: 0, y: 0, name: '张飞' },
    { id: 2, w: 2, h: 2, x: 1, y: 0, name: '曹操' },
    { id: 3, w: 1, h: 2, x: 3, y: 0, name: '赵云' },
    { id: 4, w: 1, h: 2, x: 0, y: 2, name: '马超' },
    { id: 5, w: 2, h: 1, x: 1, y: 2, name: '关羽' },
    { id: 6, w: 1, h: 2, x: 3, y: 2, name: '黄忠' },
    { id: 7, w: 1, h: 1, x: 1, y: 3, name: '卒' },
    { id: 8, w: 1, h: 1, x: 2, y: 3, name: '卒' },
    { id: 9, w: 1, h: 1, x: 0, y: 4, name: '卒' },
    { id: 10, w: 1, h: 1, x: 3, y: 4, name: '卒' },
];

function getColor(w: number, h: number) {
    if (w === 2 && h === 2) return 'bg-red-500 text-white';
    if (w === 1 && h === 2) return 'bg-blue-500 text-white';
    if (w === 2 && h === 1) return 'bg-emerald-500 text-white';
    return 'bg-amber-400 text-slate-900';
}

export default function App() {
    const [blocks, setBlocks] = useState<Block[]>(DEFAULT_BLOCKS);
    const [mode, setMode] = useState<'play' | 'edit'>('play');
    const [solveState, setSolveState] = useState<'idle' | 'solving' | 'solved' | 'failed'>('idle');
    const [explored, setExplored] = useState(0);
    const [solutionPath, setSolutionPath] = useState<{blockIndex: number, dx: number, dy: number}[]>([]);
    const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null);
    const [paletteSelection, setPaletteSelection] = useState<{w: number, h: number, name: string} | null>(null);
    const [isAutoPlaying, setIsAutoPlaying] = useState(false);

    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        let timer: number;
        if (isAutoPlaying && solveState === 'solved' && solutionPath.length > 0) {
            timer = window.setTimeout(() => {
                handleAutoMove();
            }, 400);
        } else if (solutionPath.length === 0) {
            setIsAutoPlaying(false);
        }
        return () => clearTimeout(timer);
    }, [isAutoPlaying, solveState, solutionPath]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'd' && solveState === 'solved' && solutionPath.length > 0) {
                handleAutoMove();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [solveState, solutionPath]);

    const handleAutoMove = () => {
        if (solutionPath.length > 0) {
            const move = solutionPath[0];
            setBlocks(prev => prev.map((b, i) => i === move.blockIndex ? { ...b, x: b.x + move.dx, y: b.y + move.dy } : b));
            setSolutionPath(prev => prev.slice(1));
            if (solutionPath.length === 1) {
                setSolveState('idle');
                setIsAutoPlaying(false);
            }
        }
    };

    const applyMove = (move: {blockIndex: number, dx: number, dy: number}) => {
        setBlocks(prev => prev.map((b, i) => i === move.blockIndex ? { ...b, x: b.x + move.dx, y: b.y + move.dy } : b));
        setSelectedBlockIndex(null);
        setSolveState('idle');
        setSolutionPath([]);
        setIsAutoPlaying(false);
    };

    const handleBlockClick = (block: Block, index: number) => {
        if (mode === 'edit') {
            setBlocks(blocks.filter((_, i) => i !== index));
            return;
        }

        const moves = getMoves(blocks).filter(m => m.blockIndex === index);
        if (moves.length === 1) {
            applyMove(moves[0]);
        } else if (moves.length > 1) {
            setSelectedBlockIndex(index);
        } else {
            setSelectedBlockIndex(null);
        }
    };

    const canPlaceBlock = (x: number, y: number, w: number, h: number) => {
        if (x < 0 || x + w > 4 || y < 0 || y + h > 5) return false;
        for (let b of blocks) {
            const overlapX = x < b.x + b.w && x + w > b.x;
            const overlapY = y < b.y + b.h && y + h > b.y;
            if (overlapX && overlapY) return false;
        }
        return true;
    };

    const handlePlaceBlock = (x: number, y: number) => {
        if (!paletteSelection || mode !== 'edit') return;
        if (canPlaceBlock(x, y, paletteSelection.w, paletteSelection.h)) {
            const newId = blocks.length > 0 ? Math.max(...blocks.map(b => b.id)) + 1 : 1;
            setBlocks([...blocks, {
                id: newId,
                w: paletteSelection.w,
                h: paletteSelection.h,
                x,
                y,
                name: paletteSelection.name
            }]);
        }
    };

    const startSolve = () => {
        const targetCount = blocks.filter(b => b.w === 2 && b.h === 2).length;
        if (targetCount !== 1) {
            alert('必须包含且仅包含一个2x2的目标方块！(曹操)');
            return;
        }

        let totalArea = blocks.reduce((acc, b) => acc + b.w * b.h, 0);
        if (totalArea > 18) {
            alert('方块总面积不能超过18（必须至少留2个空格）！');
            return;
        }

        setSolveState('solving');
        setExplored(0);
        setSolutionPath([]);
        setSelectedBlockIndex(null);
        setIsAutoPlaying(false);

        if (workerRef.current) {
            workerRef.current.terminate();
        }

        workerRef.current = new SolverWorker();
        workerRef.current.onmessage = (e) => {
            const { type, path, explored } = e.data;
            if (type === 'progress') {
                setExplored(explored);
            } else if (type === 'success') {
                setExplored(explored);
                setSolutionPath(path);
                setSolveState('solved');
            } else if (type === 'fail') {
                setExplored(explored);
                setSolveState('failed');
            }
        };
        workerRef.current.postMessage(blocks);
    };

    const resetToDefault = () => {
        setBlocks(DEFAULT_BLOCKS);
        setSolveState('idle');
        setSolutionPath([]);
        setSelectedBlockIndex(null);
        setIsAutoPlaying(false);
    };

    const renderArrows = (blockIndex: number) => {
        const moves = getMoves(blocks).filter(m => m.blockIndex === blockIndex);
        return moves.map(m => {
            let posClass = '';
            if (m.dx === 1) posClass = 'right-1 top-1/2 -translate-y-1/2';
            if (m.dx === -1) posClass = 'left-1 top-1/2 -translate-y-1/2';
            if (m.dy === 1) posClass = 'bottom-1 left-1/2 -translate-x-1/2';
            if (m.dy === -1) posClass = 'top-1 left-1/2 -translate-x-1/2';

            return (
                <div
                    key={`${m.dx}-${m.dy}`}
                    className={`absolute ${posClass} bg-white/90 text-slate-900 rounded-full p-1 shadow-md hover:bg-white hover:scale-110 transition-transform z-10`}
                    onClick={(e) => {
                        e.stopPropagation();
                        applyMove(m);
                    }}
                >
                    {m.dx === 1 && <ChevronRight size={16} />}
                    {m.dx === -1 && <ChevronLeft size={16} />}
                    {m.dy === 1 && <ChevronDown size={16} />}
                    {m.dy === -1 && <ChevronUp size={16} />}
                </div>
            );
        });
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans text-slate-800">
            <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-10 bg-white p-8 rounded-3xl shadow-xl">
                {/* Left: Board */}
                <div className="flex flex-col items-center">
                    <h1 className="text-3xl font-bold mb-6 text-slate-900 tracking-tight">华容道</h1>
                    <div
                        className="relative bg-slate-200 rounded-lg shadow-inner overflow-hidden"
                        style={{ width: 4 * 80, height: 5 * 80 }}
                    >
                        {/* Grid lines for edit mode */}
                        {mode === 'edit' && (
                            <div className="absolute inset-0 grid grid-cols-4 grid-rows-5 pointer-events-none">
                                {Array.from({ length: 20 }).map((_, i) => (
                                    <div key={i} className="border border-slate-300/50" />
                                ))}
                            </div>
                        )}

                        {/* Clickable grid for placing blocks in edit mode */}
                        {mode === 'edit' && paletteSelection && (
                            <div className="absolute inset-0 grid grid-cols-4 grid-rows-5">
                                {Array.from({ length: 20 }).map((_, i) => {
                                    const x = i % 4;
                                    const y = Math.floor(i / 4);
                                    return (
                                        <div
                                            key={i}
                                            className="cursor-pointer hover:bg-white/30 transition-colors"
                                            onClick={() => handlePlaceBlock(x, y)}
                                        />
                                    );
                                })}
                            </div>
                        )}

                        {/* Blocks */}
                        {blocks.map((b, i) => (
                            <motion.div
                                key={b.id}
                                animate={{ x: b.x * 80, y: b.y * 80 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                className="absolute p-1"
                                style={{ width: b.w * 80, height: b.h * 80 }}
                                onClick={() => handleBlockClick(b, i)}
                            >
                                <div className={`w-full h-full rounded-xl shadow-md flex items-center justify-center text-lg font-bold cursor-pointer transition-shadow ${getColor(b.w, b.h)} ${selectedBlockIndex === i ? 'ring-4 ring-yellow-400 shadow-lg' : ''}`}>
                                    {b.name}
                                    {/* Arrows for selected block */}
                                    {selectedBlockIndex === i && mode === 'play' && renderArrows(i)}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Right: Controls */}
                <div className="flex flex-col justify-center space-y-6">
                    <div className="flex flex-wrap gap-3">
                        <button
                            className={`px-5 py-2.5 rounded-xl font-medium transition-colors ${mode === 'play' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                            onClick={() => { setMode('play'); setSolveState('idle'); setSelectedBlockIndex(null); setIsAutoPlaying(false); }}
                        >
                            游玩模式
                        </button>
                        <button
                            className={`px-5 py-2.5 rounded-xl font-medium transition-colors ${mode === 'edit' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                            onClick={() => { setMode('edit'); setSolveState('idle'); setSolutionPath([]); setSelectedBlockIndex(null); setIsAutoPlaying(false); }}
                        >
                            设计模式
                        </button>
                    </div>

                    <div className="h-px bg-slate-200 w-full" />

                    <div className="flex flex-wrap gap-3">
                        <button
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors flex items-center gap-2"
                            onClick={resetToDefault}
                        >
                            <RotateCcw size={18} /> 默认布局
                        </button>
                        {mode === 'edit' && (
                            <button
                                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-medium transition-colors flex items-center gap-2"
                                onClick={() => setBlocks([])}
                            >
                                <Trash2 size={18} /> 清空棋盘
                            </button>
                        )}
                    </div>

                    {mode === 'edit' && (
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">选择方块</h3>
                            <div className="flex gap-4">
                                {[
                                    { w: 2, h: 2, name: '曹操' },
                                    { w: 1, h: 2, name: '竖将' },
                                    { w: 2, h: 1, name: '横将' },
                                    { w: 1, h: 1, name: '卒' }
                                ].map((p, i) => (
                                    <div
                                        key={i}
                                        className={`cursor-pointer rounded-xl p-1.5 transition-all ${paletteSelection?.w === p.w && paletteSelection?.h === p.h ? 'bg-blue-100 ring-2 ring-blue-500' : 'hover:bg-slate-200'}`}
                                        onClick={() => setPaletteSelection(p)}
                                    >
                                        <div className={`flex items-center justify-center text-xs font-bold rounded-md shadow-sm ${getColor(p.w, p.h)}`} style={{ width: p.w * 24, height: p.h * 24 }}>
                                            {p.name.substring(0, 1)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <p className="text-sm text-slate-500 mt-4 leading-relaxed">
                                1. 点击上方选择方块类型<br/>
                                2. 点击左侧棋盘空白处放置<br/>
                                3. 点击棋盘上的方块可将其删除
                            </p>
                        </div>
                    )}

                    {mode === 'play' && (
                        <div className="bg-blue-50 p-6 rounded-2xl space-y-5 border border-blue-100">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-blue-900">机器求解</h3>
                                <button
                                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={startSolve}
                                    disabled={solveState === 'solving'}
                                >
                                    {solveState === 'solving' ? '计算中...' : '计算最优解'}
                                </button>
                            </div>

                            {solveState !== 'idle' && (
                                <div className="text-sm text-blue-900 bg-white/80 p-4 rounded-xl shadow-sm space-y-2">
                                    <div className="flex justify-between">
                                        <span>探索状态数:</span>
                                        <span className="font-mono font-bold">{explored.toLocaleString()}</span>
                                    </div>
                                    {solveState === 'solved' && (
                                        <div className="flex justify-between">
                                            <span>最优解步数:</span>
                                            <span className="font-mono font-bold text-emerald-600">{solutionPath.length}</span>
                                        </div>
                                    )}
                                    {solveState === 'failed' && (
                                        <div className="text-red-600 font-bold pt-2 border-t border-red-100 mt-2">
                                            无解！请检查布局是否合理。
                                        </div>
                                    )}
                                </div>
                            )}

                            {solveState === 'solved' && solutionPath.length > 0 && (
                                <div className="flex gap-3">
                                    <button
                                        className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-colors shadow-sm flex items-center justify-center gap-2"
                                        onClick={handleAutoMove}
                                        disabled={isAutoPlaying}
                                    >
                                        <StepForward size={20} /> 单步移动 (D键)
                                    </button>
                                    <button
                                        className={`flex-1 py-3.5 text-white rounded-xl font-bold transition-colors shadow-sm flex items-center justify-center gap-2 ${isAutoPlaying ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-500 hover:bg-blue-600'}`}
                                        onClick={() => setIsAutoPlaying(!isAutoPlaying)}
                                    >
                                        {isAutoPlaying ? (
                                            <><Pause size={20} /> 暂停播放</>
                                        ) : (
                                            <><Play size={20} /> 自动播放全部</>
                                        )}
                                    </button>
                                </div>
                            )}
                            {solveState === 'solved' && solutionPath.length === 0 && (
                                <div className="text-center text-emerald-600 font-bold py-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                    已到达目标位置！
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
