import { useState, useEffect } from 'react';
import { HiCalendar, HiPlus, HiTrash, HiCheck } from 'react-icons/hi';
import Button from '../shared/Button';
import Card from '../shared/Card';
import Badge from '../shared/Badge';
import { generateUUID } from '../../utils/uuid';

interface StudyBlock {
  id: string;
  title: string;
  subject: string;
  date: string;
  duration: number;
  completed: boolean;
  type: 'review' | 'new_material' | 'practice' | 'exam_prep';
}

const STORAGE_KEY = 'inkwell_schedule';
const OLD_STORAGE_KEY = 'studyforge_schedule';

// One-time migration: copy old key to new key if new key doesn't exist yet
function migrateScheduleStorage() {
  try {
    const newData = localStorage.getItem(STORAGE_KEY);
    const oldData = localStorage.getItem(OLD_STORAGE_KEY);
    if (!newData && oldData) {
      localStorage.setItem(STORAGE_KEY, oldData);
      localStorage.removeItem(OLD_STORAGE_KEY);
    }
  } catch { /* ignore */ }
}

const typeColors: Record<string, 'cyan' | 'gray' | 'green' | 'red' | 'teal' | 'yellow'> = {
  review: 'cyan', new_material: 'green', practice: 'yellow', exam_prep: 'red',
};

const typeLabels: Record<string, string> = {
  review: '📖 Review', new_material: '📗 New', practice: '✏️ Practice', exam_prep: '📝 Exam Prep',
};

export default function StudyScheduler() {
  const [blocks, setBlocks] = useState<StudyBlock[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newBlock, setNewBlock] = useState<Partial<StudyBlock>>({
    type: 'review',
    duration: 30,
    date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    migrateScheduleStorage();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      setBlocks(saved);
    } catch { /* ignore */ }
  }, []);

  const save = (updated: StudyBlock[]) => {
    setBlocks(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const addBlock = () => {
    if (!newBlock.title || !newBlock.date) return;
    const block: StudyBlock = {
      id: generateUUID(),
      title: newBlock.title || '',
      subject: newBlock.subject || '',
      date: newBlock.date || '',
      duration: newBlock.duration || 30,
      completed: false,
      type: newBlock.type || 'review',
    };
    save([...blocks, block].sort((a, b) => a.date.localeCompare(b.date)));
    setShowAdd(false);
    setNewBlock({ type: 'review', duration: 30, date: new Date().toISOString().split('T')[0] });
  };

  const toggleComplete = (id: string) => {
    save(blocks.map((b) => b.id === id ? { ...b, completed: !b.completed } : b));
  };

  const deleteBlock = (id: string) => {
    save(blocks.filter((b) => b.id !== id));
  };

  const today = new Date().toISOString().split('T')[0];
  const todayBlocks = blocks.filter((b) => b.date === today);
  const upcomingBlocks = blocks.filter((b) => b.date > today);
  const completedCount = blocks.filter((b) => b.completed).length;
  const totalMinutes = blocks.reduce((sum, b) => sum + b.duration, 0);

  return (
    <div className="space-y-4 sm:space-y-6 overflow-x-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-white">📅 Study Schedule</h3>
          <p className="text-xs text-slate-400">Plan your study sessions with spaced repetition</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <HiPlus className="w-4 h-4" /> Add Block
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Card className="text-center">
          <div className="text-2xl font-bold text-cyan-400">{blocks.length}</div>
          <div className="text-xs text-slate-400">Total Blocks</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold text-green-400">{completedCount}</div>
          <div className="text-xs text-slate-400">Completed</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold text-yellow-400">{todayBlocks.length}</div>
          <div className="text-xs text-slate-400">Today</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold text-teal-400">{Math.round(totalMinutes / 60) + 'h'}</div>
          <div className="text-xs text-slate-400">Planned</div>
        </Card>
      </div>

      {showAdd && (
        <Card>
          <div className="grid grid-cols-2 gap-3">
            <input value={newBlock.title || ''} onChange={(e) => setNewBlock({ ...newBlock, title: e.target.value })}
              placeholder="Study block title..." className="col-span-2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200" />
            <input value={newBlock.subject || ''} onChange={(e) => setNewBlock({ ...newBlock, subject: e.target.value })}
              placeholder="Subject..." className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200" />
            <select value={newBlock.type} onChange={(e) => setNewBlock({ ...newBlock, type: e.target.value as StudyBlock['type'] })}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200">
              <option value="review">📖 Review</option>
              <option value="new_material">📗 New Material</option>
              <option value="practice">✏️ Practice</option>
              <option value="exam_prep">📝 Exam Prep</option>
            </select>
            <input type="date" value={newBlock.date} onChange={(e) => setNewBlock({ ...newBlock, date: e.target.value })}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200" />
            <input type="number" value={newBlock.duration} onChange={(e) => setNewBlock({ ...newBlock, duration: Number(e.target.value) })}
              placeholder="Duration (min)" className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200" />
            <div className="col-span-2 flex gap-2">
              <Button size="sm" onClick={addBlock}>Add</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {todayBlocks.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-cyan-400 mb-2">📍 Today</h4>
          <div className="space-y-2">
            {todayBlocks.map((block) => (
              <Card key={block.id} className={"flex items-center gap-3 " + (block.completed ? 'opacity-60' : '')}>
                <button onClick={() => toggleComplete(block.id)}
                  className={"w-6 h-6 rounded-full border-2 flex items-center justify-center " +
                    (block.completed ? 'bg-green-500 border-green-500' : 'border-slate-500')}>
                  {block.completed && <HiCheck className="w-4 h-4 text-white" />}
                </button>
                <div className="flex-1">
                  <p className={"text-sm font-medium " + (block.completed ? 'line-through text-slate-500' : 'text-slate-200')}>{block.title}</p>
                  <p className="text-xs text-slate-500">{block.subject + ' · ' + block.duration + ' min'}</p>
                </div>
                <Badge color={typeColors[block.type]}>{typeLabels[block.type]}</Badge>
                <button onClick={() => deleteBlock(block.id)} className="text-slate-500 hover:text-red-400">
                  <HiTrash className="w-4 h-4" />
                </button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {upcomingBlocks.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-teal-400 mb-2">📅 Upcoming</h4>
          <div className="space-y-2">
            {upcomingBlocks.map((block) => (
              <Card key={block.id} className="flex items-center gap-3">
                <div className="text-xs text-slate-400 w-20 shrink-0">{block.date}</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-200">{block.title}</p>
                  <p className="text-xs text-slate-500">{block.subject + ' · ' + block.duration + ' min'}</p>
                </div>
                <Badge color={typeColors[block.type]}>{typeLabels[block.type]}</Badge>
                <button onClick={() => deleteBlock(block.id)} className="text-slate-500 hover:text-red-400">
                  <HiTrash className="w-4 h-4" />
                </button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {blocks.length === 0 && !showAdd && (
        <Card className="text-center py-8">
          <HiCalendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No study blocks scheduled yet. Click "Add Block" to plan your study sessions.</p>
        </Card>
      )}
    </div>
  );
}
