import React, { useState } from 'react';
import { 
  X, Download, ExternalLink, FileText, Image as ImageIcon, 
  Code, Video, Music, AlertCircle, File, Eye
} from 'lucide-react';
import { resourceService } from '../services/api';

const ResourcePreviewModal = ({ isOpen, onClose, resource, projectId }) => {
  const [loadError, setLoadError] = useState(false);

  if (!isOpen || !resource) return null;

  const downloadUrl = resourceService.getDownloadUrl(projectId, resource._id);
  const previewUrl = resourceService.getPreviewUrl(projectId, resource._id);
  const mimeType = resource.file?.mimeType || '';
  const originalName = resource.file?.originalName || resource.title;
  const isImage = resource.category === 'Image' || mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf' || originalName.toLowerCase().endsWith('.pdf');
  const isVideo = resource.category === 'Video/Audio' && mimeType.startsWith('video/');
  const isAudio = resource.category === 'Video/Audio' && mimeType.startsWith('audio/');
  const isCode = resource.category === 'Code' || ['text/plain', 'application/json', 'text/html', 'text/css', 'text/javascript'].includes(mimeType);

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleDownload = () => {
    // Authorized download via token
    const token = localStorage.getItem('token');
    fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = originalName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      })
      .catch(err => {
        console.error('Download error:', err);
        window.open(downloadUrl, '_blank');
      });
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
              {isImage ? <ImageIcon className="w-5 h-5" /> :
               isPdf ? <FileText className="w-5 h-5" /> :
               isVideo ? <Video className="w-5 h-5" /> :
               isAudio ? <Music className="w-5 h-5" /> :
               isCode ? <Code className="w-5 h-5" /> :
               <File className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                {resource.title}
              </h3>
              <p className="text-xs text-slate-400 flex items-center gap-2">
                <span>{resource.category}</span>
                {resource.file?.size > 0 && (
                  <>
                    <span>•</span>
                    <span>{formatFileSize(resource.file.size)}</span>
                  </>
                )}
                {resource.uploader?.name && (
                  <>
                    <span>•</span>
                    <span>Uploaded by {resource.uploader.name}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {resource.type === 'file' && (
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download</span>
              </button>
            )}

            {resource.type === 'link' && resource.url && (
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open URL</span>
              </a>
            )}

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              title="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL PREVIEW CONTENT */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950/60 min-h-[300px]">
          {/* IMAGE PREVIEW */}
          {isImage && !loadError && (
            <div className="max-w-full max-h-[70vh] flex items-center justify-center">
              <img
                src={previewUrl}
                alt={resource.title}
                onError={() => setLoadError(true)}
                className="max-h-[65vh] max-w-full object-contain rounded-lg border border-slate-800 shadow-md"
              />
            </div>
          )}

          {/* PDF PREVIEW */}
          {isPdf && !loadError && (
            <div className="w-full h-[68vh] rounded-lg overflow-hidden border border-slate-800">
              <iframe
                src={`${previewUrl}#toolbar=1`}
                title={resource.title}
                onError={() => setLoadError(true)}
                className="w-full h-full bg-slate-900"
              />
            </div>
          )}

          {/* VIDEO PREVIEW */}
          {isVideo && !loadError && (
            <div className="max-w-full max-h-[68vh]">
              <video
                controls
                controlsList="nodownload"
                onError={() => setLoadError(true)}
                className="max-h-[65vh] max-w-full rounded-lg border border-slate-800"
              >
                <source src={previewUrl} type={mimeType} />
                Your browser does not support the video tag.
              </video>
            </div>
          )}

          {/* AUDIO PREVIEW */}
          {isAudio && !loadError && (
            <div className="p-8 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl text-center">
              <Music className="w-12 h-12 text-blue-400 mx-auto mb-4 animate-bounce" />
              <h4 className="text-sm font-semibold text-white mb-2">{originalName}</h4>
              <audio controls className="w-full mt-3">
                <source src={previewUrl} type={mimeType} />
                Your browser does not support the audio element.
              </audio>
            </div>
          )}

          {/* LINK PREVIEW */}
          {resource.type === 'link' && (
            <div className="p-8 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl text-center">
              <ExternalLink className="w-12 h-12 text-purple-400 mx-auto mb-3" />
              <h4 className="text-base font-semibold text-white mb-1">{resource.title}</h4>
              {resource.description && (
                <p className="text-xs text-slate-400 mb-4">{resource.description}</p>
              )}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 mb-5 break-all text-xs text-blue-400">
                {resource.url}
              </div>
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-xs"
              >
                <span>Visit Link</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}

          {/* FALLBACK / OTHER FORMATS / LOAD ERROR */}
          {(loadError || (!isImage && !isPdf && !isVideo && !isAudio && resource.type !== 'link')) && (
            <div className="p-8 text-center max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 mx-auto mb-3">
                <FileText className="w-8 h-8" />
              </div>
              <h4 className="text-base font-semibold text-white mb-1">{originalName}</h4>
              <p className="text-xs text-slate-400 mb-4">
                {loadError 
                  ? 'Preview could not be rendered for this format.' 
                  : 'Inline preview is not available for this file type. You can download it directly to view.'}
              </p>
              <button
                onClick={handleDownload}
                className="btn-primary px-5 py-2.5 text-xs flex items-center gap-2 mx-auto"
              >
                <Download className="w-4 h-4" />
                <span>Download File ({formatFileSize(resource.file?.size)})</span>
              </button>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        {resource.description && (
          <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/90 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Description:</span> {resource.description}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResourcePreviewModal;
