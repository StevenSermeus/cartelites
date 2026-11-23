import { FiEdit2, FiPlus, FiSearch, FiUsers } from 'react-icons/fi';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog';
import { ReadPagination, useReadPage } from './useReadPage';
type Contact = { _id: string; name: string; email?: string; phone?: string; address?: string };
type Draft = { name: string; email: string; phone: string; address: string };
type Props = {
  data: ReturnType<typeof useReadPage<Contact>>; search: string; onSearch: (value: string) => void;
  editorOpen: boolean; editing: boolean; draft: Draft; onDraft: (draft: Draft) => void;
  busy: boolean; error: string; onNew: () => void; onEdit: (contact: Contact) => void;
  onClose: () => void; onSave: () => void;
};
export function ContactsWorkspace(p: Props) {
  const hasSearch = !!p.search.trim();
  const laterPage = p.data.hasPrevious || p.data.hasNext;
  return <section className="contacts-workspace" aria-label="Répertoire des contacts">
    <div className="contacts-toolbar"><label><FiSearch aria-hidden="true" /><span className="sr-only">Rechercher un contact</span><Input type="search" placeholder="Nom, e-mail, téléphone ou adresse…" value={p.search} onChange={event => p.onSearch(event.target.value)} /></label><Button onClick={p.onNew}><FiPlus aria-hidden="true" />Nouveau contact</Button></div>
    {p.error && !p.editorOpen && <p role="status">{p.error}</p>}
    <div className="contacts-list"><table><caption className="sr-only">Coordonnées des contacts de la boutique</caption><thead><tr><th>Contact</th><th>E-mail</th><th>Téléphone</th><th>Adresse</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{p.data.items.map(contact => <tr key={contact._id}><td><button type="button" className="contact-name" onClick={() => p.onEdit(contact)}><span className="contact-initial" aria-hidden="true">{contact.name.slice(0,1).toUpperCase()}</span><strong>{contact.name}</strong></button></td><td data-label="E-mail">{contact.email || '—'}</td><td data-label="Téléphone">{contact.phone || '—'}</td><td data-label="Adresse">{contact.address || '—'}</td><td><Button variant="ghost" size="icon" aria-label={`Modifier ${contact.name}`} onClick={() => p.onEdit(contact)}><FiEdit2 /></Button></td></tr>)}</tbody></table>
    {!p.data.busy && !p.data.error && !p.data.items.length && <div className="workspace-empty"><FiUsers aria-hidden="true" /><h2>{laterPage ? 'Aucun contact dans cette page' : hasSearch ? 'Aucun contact trouvé' : 'Votre répertoire commence ici'}</h2><p>{p.data.hasNext ? 'Poursuivez avec Suivant pour parcourir les autres contacts correspondant à votre recherche.' : p.data.hasPrevious ? 'Revenez à la page précédente ou ajustez votre recherche.' : hasSearch ? 'Essayez un autre nom ou une autre coordonnée.' : 'Créez un contact pour préparer un rachat, une réception ou un dépôt.'}</p>{hasSearch ? <Button variant="outline" onClick={() => p.onSearch('')}>Effacer la recherche</Button> : !laterPage && <Button variant="outline" onClick={p.onNew}>Créer un contact</Button>}</div>}</div>
    <ReadPagination data={p.data} emptyState={null} />
    <Dialog open={p.editorOpen} onOpenChange={open => { if(!open && !p.busy) p.onClose(); }}><DialogContent className="contact-editor-dialog"><DialogTitle>{p.editing ? 'Modifier le contact' : 'Nouveau contact'}</DialogTitle><DialogDescription>Une seule fiche pour retrouver les opérations de ce contact.</DialogDescription><form onSubmit={event => { event.preventDefault(); p.onSave(); }}>
      <label>Nom<Input required autoComplete="name" value={p.draft.name} onChange={event => p.onDraft({...p.draft,name:event.target.value})} /></label>
      <div className="form-grid"><label>E-mail<Input type="email" autoComplete="email" value={p.draft.email} onChange={event => p.onDraft({...p.draft,email:event.target.value})} /></label><label>Téléphone<Input type="tel" autoComplete="tel" value={p.draft.phone} onChange={event => p.onDraft({...p.draft,phone:event.target.value})} /></label></div>
      <label>Adresse<Input autoComplete="street-address" value={p.draft.address} onChange={event => p.onDraft({...p.draft,address:event.target.value})} /></label>
      {p.error && <p role="alert" className="error">{p.error}</p>}<div className="actions"><Button type="button" variant="outline" disabled={p.busy} onClick={p.onClose}>Annuler</Button><Button type="submit" disabled={p.busy}>{p.busy ? 'Enregistrement…' : p.editing ? 'Enregistrer' : 'Créer le contact'}</Button></div>
    </form></DialogContent></Dialog>
  </section>;
}
