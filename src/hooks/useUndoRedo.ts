import { useCallback, useRef, useState } from 'react';

export interface UndoableCommand {
  type: string;
  description: string;
  execute: () => void;
  undo: () => void;
}

interface UndoRedoState {
  canUndo: boolean;
  canRedo: boolean;
  undoDescription: string | null;
  redoDescription: string | null;
}

export function useUndoRedo(maxHistory: number = 50) {
  const undoStack = useRef<UndoableCommand[]>([]);
  const redoStack = useRef<UndoableCommand[]>([]);
  const [state, setState] = useState<UndoRedoState>({
    canUndo: false,
    canRedo: false,
    undoDescription: null,
    redoDescription: null,
  });

  const updateState = useCallback(() => {
    setState({
      canUndo: undoStack.current.length > 0,
      canRedo: redoStack.current.length > 0,
      undoDescription: undoStack.current.length > 0
        ? undoStack.current[undoStack.current.length - 1].description
        : null,
      redoDescription: redoStack.current.length > 0
        ? redoStack.current[redoStack.current.length - 1].description
        : null,
    });
  }, []);

  const push = useCallback(
    (command: UndoableCommand) => {
      command.execute();
      undoStack.current.push(command);
      // Trim to max history
      if (undoStack.current.length > maxHistory) {
        undoStack.current.shift();
      }
      // Clear redo stack on new action
      redoStack.current = [];
      updateState();
    },
    [maxHistory, updateState]
  );

  const undo = useCallback(() => {
    const command = undoStack.current.pop();
    if (!command) return;
    command.undo();
    redoStack.current.push(command);
    updateState();
  }, [updateState]);

  const redo = useCallback(() => {
    const command = redoStack.current.pop();
    if (!command) return;
    command.execute();
    undoStack.current.push(command);
    updateState();
  }, [updateState]);

  const clear = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    updateState();
  }, [updateState]);

  return {
    push,
    undo,
    redo,
    clear,
    ...state,
  };
}
