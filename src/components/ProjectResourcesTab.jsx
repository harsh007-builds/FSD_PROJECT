import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  FileText, Upload, Plus, Search, Filter, Download, 
  ExternalLink, Eye, Edit3, Trash2, Tag, Calendar, 
  User, RefreshCw, AlertTriangle, Image as ImageIcon, 
  Code, Video, Music, File, ChevronLeft, ChevronRight, X
} from 'lucide-react';
import { resourceService } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useSocket } from '../context/SocketContext';
import UploadResourceModal from './UploadResourceModal';
import EditResourceModal from './EditResourceModal';
import ResourcePreviewModal from './ResourcePreviewModal';
import ConfirmModal from './ConfirmModal';

const CATEGORY_COLORS = {
  Document: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Image: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Code: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Video/Audio': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Link: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  Other: 'bg-slate-700/40 text-slate-400 border-slate-700',
};

const ProjectResourcesTab = ({ projectId, project, currentUser, userRole }) => {
  const toast = useToast();
  const socketContext = useSocket();
  const socket = socketContext?.socket;

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [type, setType] = useState('all'); // 'all' | 'file' | 'link'
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const limit = 12;

  // Data state
  const [resources, setResources] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [categoryCounts, setCategoryCounts] = useState({
    all: 0,
    Document: 0,
    Image: 0,
    Code: 0,
    'Video/Audio': 0,
    Link: 0,
    Other: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [previewingResource, setPreviewingResource] = useState(null);
  const [editingResource, setEditingResource] = useState(null);
  const [resourceToDelete, setResourceToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Check user role permissions
  const isOwner = userRole === 'Owner' || project?.owner?._id === currentUser?._id || project?.owner === currentUser?._id;
  const isAdmin = userRole === 'Admin';
  const canManageAny = isOwner || isAdmin;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch resources
  const fetchResources = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);

      const params = {
        page,
        limit,
        sortBy,
        sortOrder,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (category && category !== 'all') params.category = category;
      if (type && type !== 'all') params.type = type;

      const data = await resourceService.getResources(projectId, params);
      setResources(data.resources || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      if (data.categories) {
        setCategoryCounts(data.categories);
      }
    } catch (err) {
      console.error('Failed to load project resources:', err);
      setError(err.message || 'Failed to load resources');
    } finally {
      setLoading(false);
    }
  }, [projectId, debouncedSearch, category, type, sortBy, sortOrder, page]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  // Real-time socket updates for resources in this project
  useEffect(() => {
    if (!socket || !projectId) return;

    const handleCreated = (newRes) => {
      fetchResources();
    };
    const handleUpdated = (updatedRes) => {
      fetchResources();
    };
    const handleDeleted = () => {
      fetchResources();
    };

    socket.on('resource:created', handleCreated);
    socket.on('resource:updated', handleUpdated);
    socket.on('resource:deleted', handleDeleted);

    return () => {
      socket.off('resource:created', handleCreated);
      socket.off('resource:updated', handleUpdated);
      socket.off('resource:deleted', handleDeleted);
    };
  }, [socket, projectId, fetchResources]);

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Authorized file download
  const handleDownload = (e, res) => {
    e.stopPropagation();
    if (res.type === 'link') {
      window.open(res.url, '_blank', 'noopener,noreferrer');
      return;
    }

    const downloadUrl = resourceService.getDownloadUrl(projectId, res._id);
    const token = localStorage.getItem('token');
    
    fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(response => {
        if (!response.ok) throw new Error('Download failed');
        return response.blob();
      })
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.file?.originalName || res.title;
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

  // Delete resource confirmation
  const handleConfirmDelete = async () => {
    if (!resourceToDelete) return;
    try {
      setIsDeleting(true);
      await resourceService.deleteResource(projectId, resourceToDelete._id);
      toast.success('Resource deleted successfully');
      setResourceToDelete(null);
      fetchResources();
    } catch (err) {
      toast.error(err.message || 'Failed to delete resource');
    } finally {
      setIsDeleting(false);
    }
  };

  // Get matching icon for resource
  const getResourceIcon = (res) => {
    if (res.type === 'link') return <ExternalLink className="w-5 h-5 text-pink-400" />;
    switch (res.category) {
      case 'Image':
        return <ImageIcon className="w-5 h-5 text-emerald-400" />;
      case 'Code':
        return <Code className="w-5 h-5 text-amber-400" />;
      case 'Video/Audio':
        return <Video className="w-5 h-5 text-purple-400" />;
      case 'Document':
        return <FileText className="w-5 h-5 text-blue-400" />;
      default:
        return <File className="w-5 h-5 text-slate-400" />;
    }
  };

  const hasActiveFilters = Boolean(search || category !== 'all' || type !== 'all' || sortBy !== 'createdAt');

  const handleResetFilters = () => {
    setSearch('');
    setCategory('all');
    setType('all');
    setSortBy('createdAt');
    setSortOrder('desc');
    setPage(1);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* 1. HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Project Resources & Files</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {total}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload persistent cloud documents, media, code snippets, or share reference links
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => fetchResources()}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50"
            title="Refresh resources"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/10"
          >
            <Plus className="w-4 h-4" />
            <span>Add Resource</span>
          </button>
        </div>
      </div>

      {/* 2. CATEGORY PILLS BAR */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {[
          { id: 'all', label: `All (${categoryCounts.all || 0})` },
          { id: 'Document', label: `Documents (${categoryCounts.Document || 0})` },
          { id: 'Image', label: `Images (${categoryCounts.Image || 0})` },
          { id: 'Code', label: `Code (${categoryCounts.Code || 0})` },
          { id: 'Video/Audio', label: `Audio/Video (${categoryCounts['Video/Audio'] || 0})` },
          { id: 'Link', label: `Links (${categoryCounts.Link || 0})` },
          { id: 'Other', label: `Other (${categoryCounts.Other || 0})` },
        ].map(cat => (
          <button
            key={cat.id}
            onClick={() => { setCategory(cat.id); setPage(1); }}
            className={`px-3.5 py-1.5 rounded-xl font-medium transition-colors shrink-0 ${
              category === cat.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 3. SEARCH & SORT TOOLBAR */}
      <div className="p-3.5 rounded-2xl bg-slate-900/40 border border-slate-800 flex flex-col sm:flex-row items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, description, tags, filename..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto text-xs">
          <select
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}
            className="w-full sm:w-auto bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Types</option>
            <option value="file">Files Only</option>
            <option value="link">Links Only</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
            className="w-full sm:w-auto bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="createdAt">Sort: Newest</option>
            <option value="title">Sort: Title</option>
            <option value="size">Sort: File Size</option>
            <option value="category">Sort: Category</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="p-2 rounded-xl bg-slate-800 hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
              title="Reset filters"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 4. RESOURCES LIST / GRID */}
      {loading ? (
        <div className="py-24 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/10">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-400">Loading project resources...</p>
        </div>
      ) : error ? (
        <div className="py-16 text-center text-red-400 border border-dashed border-red-500/20 rounded-2xl bg-red-500/5">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-80" />
          <p className="text-sm font-semibold">Failed to fetch resources</p>
          <p className="text-xs text-slate-500 mt-1">{error}</p>
          <button
            onClick={() => fetchResources()}
            className="mt-4 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-white"
          >
            Try Again
          </button>
        </div>
      ) : resources.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/10 px-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-white">No resources found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {hasActiveFilters
              ? 'No resources match your search or filter criteria. Try clearing active filters.'
              : 'Keep project files, lecture notes, syllabus, reference guides, and links all in one place.'}
          </p>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="mt-4 btn-primary px-4 py-2 text-xs font-medium"
          >
            Add Your First Resource
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {resources.map((res) => {
            const canModify = canManageAny || res.uploader?._id === currentUser?._id;
            const categoryStyle = CATEGORY_COLORS[res.category] || CATEGORY_COLORS.Other;

            return (
              <div
                key={res._id}
                className="bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 group shadow-lg shadow-black/20"
              >
                <div>
                  {/* Top: Icon, Category Badge & Action Menu */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 shrink-0">
                        {getResourceIcon(res)}
                      </div>
                      <div className="min-w-0">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${categoryStyle}`}>
                          {res.category}
                        </span>
                        {res.type === 'file' && res.file?.size > 0 && (
                          <span className="text-[11px] text-slate-500 ml-2">
                            {formatFileSize(res.file.size)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      {res.type === 'file' && (
                        <button
                          onClick={(e) => handleDownload(e, res)}
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Download file"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => setPreviewingResource(res)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        title="Preview / Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {canModify && (
                        <>
                          <button
                            onClick={() => setEditingResource(res)}
                            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Edit / Rename"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setResourceToDelete(res)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Delete resource"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 
                    onClick={() => setPreviewingResource(res)}
                    className="text-sm font-semibold text-white group-hover:text-blue-400 cursor-pointer line-clamp-1 transition-colors"
                    title={res.title}
                  >
                    {res.title}
                  </h3>

                  {res.description && (
                    <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                      {res.description}
                    </p>
                  )}

                  {/* URL badge for links */}
                  {res.type === 'link' && res.url && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-400/90 truncate">
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      <a 
                        href={res.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="truncate hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {res.url}
                      </a>
                    </div>
                  )}

                  {/* Tags */}
                  {res.tags && res.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                      {res.tags.map((t, idx) => (
                        <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer: Uploader & Timestamp */}
                <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                  <div className="flex items-center gap-1.5 truncate max-w-[160px]">
                    <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
                      {res.uploader?.avatarInitials || res.uploader?.name?.[0] || '?'}
                    </div>
                    <span className="truncate">{res.uploader?.name || 'Teammate'}</span>
                  </div>

                  <span className="shrink-0">
                    {new Date(res.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. PAGINATION CONTROLS */}
      {totalPages > 1 && (
        <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-2xl flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing {resources.length} of {total} resources
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-colors"
              title="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-slate-300 font-medium">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-colors"
              title="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* MODALS */}
      <UploadResourceModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        projectId={projectId}
        onResourceCreated={() => fetchResources()}
      />

      {previewingResource && (
        <ResourcePreviewModal
          isOpen={Boolean(previewingResource)}
          onClose={() => setPreviewingResource(null)}
          resource={previewingResource}
          projectId={projectId}
        />
      )}

      {editingResource && (
        <EditResourceModal
          isOpen={Boolean(editingResource)}
          onClose={() => setEditingResource(null)}
          resource={editingResource}
          projectId={projectId}
          onResourceUpdated={() => fetchResources()}
        />
      )}

      {resourceToDelete && (
        <ConfirmModal
          isOpen={Boolean(resourceToDelete)}
          onClose={() => setResourceToDelete(null)}
          onConfirm={handleConfirmDelete}
          title="Delete Resource"
          message={`Are you sure you want to delete "${resourceToDelete.title}"? ${
            resourceToDelete.type === 'file' ? 'The uploaded file will be permanently removed from storage.' : ''
          }`}
          confirmText={isDeleting ? 'Deleting...' : 'Delete'}
          type="danger"
        />
      )}
    </div>
  );
};

export default ProjectResourcesTab;
