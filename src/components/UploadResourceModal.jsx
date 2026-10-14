import React, { useState, useRef } from 'react';
import { 
  X, Upload, Link as LinkIcon, FileText, Image as ImageIcon, 
  Code, Video, AlertTriangle, CheckCircle2, RefreshCw 
} from 'lucide-react';
import { resourceService } from '../services/api';
import { useToast } from '../context/ToastContext';

const CATEGORIES = ['Document', 'Image', 'Code', 'Video/Audio', 'Link', 'Other'];

const UploadResourceModal = ({ isOpen, onClose, projectId, onResourceCreated }) => {
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('file'); // 'file' | 'link'
  const [selectedFile, setSelectedFile] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Document');
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');

  // Upload Progress & State
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState(''); // 'uploading' | 'processing' | 'done' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  // Auto-detect category on file selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 25MB
    if (file.size > 25 * 1024 * 1024) {
      setErrorMessage('Selected file exceeds maximum limit of 25MB.');
      return;
    }

    setSelectedFile(file);
    setErrorMessage('');
    if (!title) {
      setTitle(file.name);
    }

    // Auto-detect category
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const mime = file.type.toLowerCase();

    if (mime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
      setCategory('Image');
    } else if (mime.startsWith('video/') || mime.startsWith('audio/') || ['.mp4', '.webm', '.mp3', '.wav'].includes(ext)) {
      setCategory('Video/Audio');
    } else if (['.js', '.ts', '.jsx', '.tsx', '.json', '.html', '.css', '.py', '.java', '.cpp'].includes(ext) || mime === 'application/json') {
      setCategory('Code');
    } else if (mime === 'application/pdf' || ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md'].includes(ext)) {
      setCategory('Document');
    } else {
      setCategory('Other');
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setTitle('');
    setDescription('');
    setCategory('Document');
    setUrl('');
    setTags('');
    setUploadProgress(0);
    setUploading(false);
    setUploadStatus('');
    setErrorMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (uploading) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (activeTab === 'file') {
      if (!selectedFile) {
        setErrorMessage('Please select a file to upload');
        return;
      }

      try {
        setUploading(true);
        setUploadStatus('uploading');
        setUploadProgress(0);

        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('title', title.trim() || selectedFile.name);
        formData.append('description', description.trim());
        formData.append('category', category);
        formData.append('type', 'file');
        formData.append('tags', tags);

        const created = await resourceService.uploadFileResource(
          projectId,
          formData,
          (percent) => {
            setUploadProgress(percent);
            if (percent === 100) {
              setUploadStatus('processing');
            }
          }
        );

        setUploadStatus('done');
        toast.success(`File "${created.title}" uploaded successfully!`);
        if (onResourceCreated) onResourceCreated(created);
        setTimeout(() => {
          handleClose();
        }, 600);
      } catch (err) {
        console.error('Upload error:', err);
        setUploadStatus('error');
        setErrorMessage(err.message || 'File upload failed');
        toast.error(err.message || 'Upload failed');
      } finally {
        setUploading(false);
      }
    } else {
      // LINK TAB
      if (!url.trim()) {
        setErrorMessage('Please enter a valid link URL');
        return;
      }
      if (!/^https?:\/\//i.test(url.trim())) {
        setErrorMessage('URL must start with http:// or https://');
        return;
      }

      try {
        setUploading(true);
        const linkData = {
          title: title.trim() || url.trim(),
          url: url.trim(),
          description: description.trim(),
          category: category === 'Document' ? 'Link' : category,
          tags,
        };

        const created = await resourceService.createLinkResource(projectId, linkData);
        toast.success(`Resource link added successfully!`);
        if (onResourceCreated) onResourceCreated(created);
        handleClose();
      } catch (err) {
        console.error('Add link error:', err);
        setErrorMessage(err.message || 'Failed to add resource link');
        toast.error(err.message || 'Failed to add link');
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={handleClose}
    >
      <div 
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div>
            <h3 className="text-base font-bold text-white">Add Project Resource</h3>
            <p className="text-xs text-slate-400 mt-0.5">Upload a persistent file or attach an external learning link</p>
          </div>
          <button
            onClick={handleClose}
            disabled={uploading}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TAB TOGGLE: FILE VS LINK */}
        <div className="px-6 pt-4 pb-2 border-b border-slate-800/60 bg-slate-950/40 flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setActiveTab('file'); setErrorMessage(''); }}
            disabled={uploading}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'file'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload File (Max 25MB)</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('link'); setErrorMessage(''); if (category === 'Document') setCategory('Link'); }}
            disabled={uploading}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'link'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            <span>Add External Link</span>
          </button>
        </div>

        {/* MODAL FORM */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-xs text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* TAB 1: FILE UPLOAD ZONE */}
          {activeTab === 'file' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Select File
              </label>
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${
                  selectedFile 
                    ? 'border-blue-500/50 bg-blue-500/5' 
                    : 'border-slate-700 hover:border-slate-600 bg-slate-950/40 hover:bg-slate-950/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="hidden"
                />
                
                {selectedFile ? (
                  <div className="flex flex-col items-center">
                    <CheckCircle2 className="w-8 h-8 text-blue-400 mb-2" />
                    <p className="text-sm font-semibold text-white">{selectedFile.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type || 'File'}
                    </p>
                    <span className="text-[11px] text-blue-400 hover:underline mt-2">Click to choose a different file</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Upload className="w-8 h-8 text-slate-500 mb-2" />
                    <p className="text-sm font-medium text-slate-200">
                      Click to browse or drag & drop file here
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      PDF, Images, Word, Excel, Slides, Audio, Video, Code, Zip (Up to 25MB)
                    </p>
                  </div>
                )}
              </div>

              {/* Upload Progress Bar */}
              {uploading && (
                <div className="mt-4 p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                      {uploadStatus === 'processing' ? 'Encrypting & Storing in Cloud...' : `Uploading (${uploadProgress}%)...`}
                    </span>
                    <span className="text-blue-400">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LINK INPUT */}
          {activeTab === 'link' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Target URL <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <LinkIcon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://docs.google.com/..., https://github.com/..."
                  required
                  disabled={uploading}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* COMMON FIELDS: TITLE & CATEGORY */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Resource Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={activeTab === 'file' ? 'Leave empty to use filename' : 'e.g. Project Architecture Doc'}
                disabled={uploading}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={uploading}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* DESCRIPTION */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add useful notes, context, or revision notes..."
              rows={2}
              disabled={uploading}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* TAGS */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Tags (Comma-separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. syllabus, lecture-1, design, draft"
              disabled={uploading}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* MODAL ACTIONS */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={handleClose}
              disabled={uploading}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || (activeTab === 'file' && !selectedFile) || (activeTab === 'link' && !url.trim())}
              className="btn-primary px-5 py-2 text-xs font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>{activeTab === 'file' ? 'Upload Resource' : 'Save Link'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UploadResourceModal;
