import React, { useEffect, useState } from 'react';
import { UserProfile, BusinessConfig, Category } from '../../types';
import { db, DEFAULT_BUSINESS_ID } from '../../lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { logAuditAction } from '../../lib/utils';
import { DEFAULT_FALLBACK_CATEGORIES } from '../../lib/offlineManager';
import { Layers, Plus, Trash2, AlertCircle, CheckCircle2, Pill } from 'lucide-react';

interface CategoriesViewProps {
  user: UserProfile;
  businessConfig?: BusinessConfig | null;
}

const foodCourtTerms = [
  'hotel', 'room', 'beer', 'tusker', 'white cap', 'guinness', 'heineken',
  'smirnoff', 'vodka', 'whiskey', 'cocktail', 'tilapia', 'pilau', 'burger',
  'spa', 'massage', 'food court'
];

export function CategoriesView({ user, businessConfig }: CategoriesViewProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  async function fetchCategories() {
    try {
      const catRef = collection(db, 'businesses', DEFAULT_BUSINESS_ID, 'categories');
      const catSnap = await getDocs(catRef);
      const cats: Category[] = [];
      catSnap.forEach(d => {
        const data = d.data();
        const text = ((data.name || '') + ' ' + (data.description || '') + ' ' + d.id).toLowerCase();
        const isFood = foodCourtTerms.some(term => text.includes(term));
        if (!isFood) {
          cats.push({ id: d.id, ...data } as Category);
        } else {
          deleteDoc(doc(catRef, d.id)).catch(() => {});
        }
      });

      if (cats.length === 0) {
        // Seed default chemist categories
        for (const c of DEFAULT_FALLBACK_CATEGORIES) {
          await setDoc(doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'categories', c.id), c).catch(() => {});
        }
        setCategories(DEFAULT_FALLBACK_CATEGORIES);
        localStorage.setItem('bar_pos_local_categories', JSON.stringify(DEFAULT_FALLBACK_CATEGORIES));
      } else {
        setCategories(cats);
        localStorage.setItem('bar_pos_local_categories', JSON.stringify(cats));
      }
    } catch (err) {
      try {
        const localCats = JSON.parse(localStorage.getItem('bar_pos_local_categories') || '[]');
        const filtered = localCats.filter((c: Category) => {
          const text = ((c.name || '') + ' ' + (c.description || '') + ' ' + c.id).toLowerCase();
          return !foodCourtTerms.some(term => text.includes(term));
        });
        if (filtered.length > 0) {
          setCategories(filtered);
        } else {
          setCategories(DEFAULT_FALLBACK_CATEGORIES);
          localStorage.setItem('bar_pos_local_categories', JSON.stringify(DEFAULT_FALLBACK_CATEGORIES));
        }
      } catch (e) {
        setCategories(DEFAULT_FALLBACK_CATEGORIES);
      }
    } finally {
      setLoading(false);
    }
  }

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) {
      setError('Category name is required');
      return;
    }
    try {
      const catId = 'cat-' + Date.now();
      const newCat: Category = {
        id: catId,
        name: newCatName.trim(),
        description: newCatDesc.trim() || 'Alpha Chemist Category'
      };
      await setDoc(doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'categories', catId), newCat);
      const updatedCats = [...categories, newCat];
      setCategories(updatedCats);
      localStorage.setItem('bar_pos_local_categories', JSON.stringify(updatedCats));
      await logAuditAction(user.uid, user.name, 'CATEGORY_CREATED', `Created chemist category ${newCat.name}`, catId);
      setNewCatName('');
      setNewCatDesc('');
      setError('');
      setSuccess(`Category "${newCat.name}" added successfully.`);
    } catch (err: any) {
      setError(err.message || 'Failed to add category');
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    setIsDeleting(true);
    setError('');
    setSuccess('');
    try {
      try {
        await deleteDoc(doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'categories', cat.id));
      } catch (e) {
        console.warn('Firestore delete failed, continuing locally:', e);
      }
      const updatedCats = categories.filter(c => c.id !== cat.id);
      setCategories(updatedCats);
      localStorage.setItem('bar_pos_local_categories', JSON.stringify(updatedCats));
      await logAuditAction(user.uid, user.name, 'CATEGORY_DELETED', `Deleted category ${cat.name}`, cat.id);
      setSuccess(`Category "${cat.name}" was deleted.`);
      setDeletingCatId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete category');
    } finally {
      setIsDeleting(false);
    }
  };

  const hasNonChemistCategories = categories.some(cat => {
    const text = (cat.name + ' ' + (cat.description || '') + ' ' + cat.id).toLowerCase();
    return foodCourtTerms.some(t => text.includes(t));
  });

  const handleResetToDefaultChemist = async () => {
    setIsDeleting(true);
    setError('');
    setSuccess('');
    try {
      for (const cat of categories) {
        await deleteDoc(doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'categories', cat.id)).catch(() => {});
      }

      for (const c of DEFAULT_FALLBACK_CATEGORIES) {
        await setDoc(doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'categories', c.id), c).catch(() => {});
      }

      setCategories(DEFAULT_FALLBACK_CATEGORIES);
      localStorage.setItem('bar_pos_local_categories', JSON.stringify(DEFAULT_FALLBACK_CATEGORIES));

      setSuccess('Restored standard pharmacy medicine categories successfully.');
      await logAuditAction(user.uid, user.name, 'CATEGORIES_RESET', 'Restored standard pharmacy categories', 'batch');
    } catch (err: any) {
      setError(err.message || 'Failed to restore pharmacy categories');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
            <Pill className="w-6 h-6 text-emerald-600" />
            <span>Pharmaceutical & Medicine Categories</span>
          </h2>
          <p className="text-sm text-gray-500">Manage Alpha Chemist product categories, prescription groups, and OTC departments</p>
        </div>
        <button
          type="button"
          onClick={handleResetToDefaultChemist}
          disabled={isDeleting}
          className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-bold transition-all flex items-center space-x-1.5 self-start sm:self-auto cursor-pointer"
        >
          <Layers className="w-4 h-4 text-slate-600" />
          <span>Reset to Standard Chemist Categories</span>
        </button>
      </div>

      {success && (
        <div className="flex items-center space-x-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center space-x-2 rounded-2xl bg-red-50 p-4 text-sm text-red-700 border border-red-200">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {hasNonChemistCategories && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-200 rounded-3xl">
          <div className="flex items-center space-x-2 text-amber-900">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-bold">Food or Bar Categories Detected</p>
              <p className="text-xs text-amber-700">Click below to restore official pharmacy categories.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetToDefaultChemist}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition-all flex items-center justify-center space-x-1.5 shrink-0 active:scale-95"
          >
            <Trash2 className="w-4 h-4" />
            <span>Restore Pharmacy Categories</span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add Category Form Card */}
        <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-emerald-600">
            <Layers className="w-5 h-5" />
            <h3 className="text-lg font-bold text-gray-900">Add Pharmacy Category</h3>
          </div>

          <form onSubmit={handleAddCategory} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">
                Category Name
              </label>
              <input
                type="text"
                required
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Antibiotics & Anti-Infectives"
                className="w-full rounded-xl border border-gray-300 p-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">
                Description / Drug Classes
              </label>
              <textarea
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                placeholder="e.g. Amoxicillin, Ciprofloxacin, Antifungals..."
                rows={3}
                className="w-full rounded-xl border border-gray-300 p-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              <span>Save Pharmacy Category</span>
            </button>
          </form>
        </div>

        {/* Categories List */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">Configured Categories ({categories.length})</h3>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading categories...</div>
          ) : categories.length === 0 ? (
            <div className="p-12 text-center text-gray-400">No categories found. Create your first category on the left.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {categories.map(cat => (
                <div key={cat.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/80 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-base font-bold text-gray-900">{cat.name}</h4>
                      <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {cat.id}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{cat.description || 'No description provided'}</p>
                  </div>
                  {deletingCatId === cat.id ? (
                    <div className="flex items-center space-x-2 bg-red-50 p-2 rounded-2xl border border-red-200 shrink-0">
                      <span className="text-xs font-bold text-red-700 pl-1">Delete category?</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat)}
                        disabled={isDeleting}
                        className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs transition-all flex items-center space-x-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{isDeleting ? 'Deleting...' : 'Yes, Delete'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingCatId(null)}
                        disabled={isDeleting}
                        className="px-2.5 py-1.5 rounded-xl bg-white border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-100 transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setSuccess('');
                        setDeletingCatId(cat.id);
                      }}
                      className="px-3 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-all flex items-center space-x-1.5 shrink-0 self-start sm:self-auto font-medium text-xs cursor-pointer"
                      title="Delete Category"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
