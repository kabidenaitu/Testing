import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MediaFile } from '@/types/complaint';
import { Upload, X, Image, Video, Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

interface FileUploadProps {
  files: MediaFile[];
  onFilesChange: (files: MediaFile[]) => void;
}

export const FileUpload = ({ files, onFilesChange }: FileUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const { t, language } = useLanguage();

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;

    const newFiles: MediaFile[] = [];

    Array.from(fileList).forEach((file) => {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const isAudio = file.type.startsWith('audio/');

      const maxSize = isImage ? 10 * 1024 * 1024 : 30 * 1024 * 1024;

      if (file.size > maxSize) {
        alert(`${file.name}: ${t('fileUpload.tooLarge')}`);
        return;
      }

      const preview = URL.createObjectURL(file);
      const type = isImage ? 'image' : isVideo ? 'video' : 'audio';

      newFiles.push({
        id: `${Date.now()}-${file.name}`,
        file,
        preview,
        size: file.size,
        type,
      });
    });

    onFilesChange([...files, ...newFiles]);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    onFilesChange(files.filter((f) => f.id !== id));
  };

  const formatSize = (bytes: number) => {
    const unit = language === 'kz' || language === 'ru' ? 'МБ' : 'MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)} ${unit}`;
  };

  const getIcon = (type: MediaFile['type']) => {
    switch (type) {
      case 'image':
        return <Image className="h-6 w-6" />;
      case 'video':
        return <Video className="h-6 w-6" />;
      case 'audio':
        return <Music className="h-6 w-6" />;
    }
  };

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'relative rounded-lg border-2 border-dashed p-8 text-center transition-colors',
          dragActive ? 'border-primary bg-primary/5' : 'border-muted'
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-lg font-medium">{t('fileUpload.dragDrop')}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('fileUpload.limits')}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => inputRef.current?.click()}
        >
          {t('fileUpload.select')}
        </Button>
      </div>

      {files.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="group relative overflow-hidden rounded-lg border bg-card p-4 shadow-soft hover-lift"
            >
              <div className="flex items-start gap-3">
                <div className="text-primary">{getIcon(file.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{file.file.name}</p>
                  <p className="text-sm text-muted-foreground">{formatSize(file.size)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => removeFile(file.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {file.type === 'image' && (
                <img
                  src={file.preview}
                  alt="Preview"
                  className="mt-3 h-32 w-full rounded object-cover"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
