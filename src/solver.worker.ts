import { getBoardString, getMoves, Block, Move } from './gameLogic';

const MAX_STATES = 500_000;

self.onmessage = (e) => {
    const blocks: Block[] = e.data;
    let queue: { blocks: Block[]; path: Move[] }[] = [{ blocks, path: [] }];
    let visited = new Set<string>();
    visited.add(getBoardString(blocks));

    let head = 0;
    let explored = 0;

    while (head < queue.length) {
        // Periodically trim processed entries to free memory
        if (head > 1000) {
            queue = queue.slice(head);
            head = 0;
        }

        if (explored >= MAX_STATES) {
            self.postMessage({ type: 'fail', explored });
            return;
        }

        let current = queue[head++];
        explored++;

        if (explored % 5000 === 0) {
            self.postMessage({ type: 'progress', explored });
        }

        let target = current.blocks.find((b) => b.w === 2 && b.h === 2);
        if (target && target.x === 1 && target.y === 3) {
            self.postMessage({ type: 'success', path: current.path, explored });
            return;
        }

        for (let move of getMoves(current.blocks)) {
            let newBlocks = current.blocks.map((b, i) =>
                i === move.blockIndex ? { ...b, x: b.x + move.dx, y: b.y + move.dy } : b
            );

            let stateStr = getBoardString(newBlocks);
            if (!visited.has(stateStr)) {
                visited.add(stateStr);
                queue.push({ blocks: newBlocks, path: [...current.path, move] });
            }
        }
    }
    self.postMessage({ type: 'fail', explored });
};
