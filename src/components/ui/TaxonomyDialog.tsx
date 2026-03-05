import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TextInput } from '@/components/ui/TextInput';

interface TaxonomyDialogProps {
  open: boolean;
  title: string;
  name: string;
  color: string;
  confirmText: string;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function TaxonomyDialog({
  open,
  title,
  name,
  color,
  confirmText,
  onNameChange,
  onColorChange,
  onCancel,
  onConfirm,
}: TaxonomyDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      className="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm text-slate-600">名称</label>
          <TextInput value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="输入名称" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">颜色</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(event) => onColorChange(event.target.value)}
              className="h-10 w-14 cursor-pointer rounded-md border border-slate-200 bg-white p-1"
            />
            <TextInput value={color} onChange={(event) => onColorChange(event.target.value)} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
