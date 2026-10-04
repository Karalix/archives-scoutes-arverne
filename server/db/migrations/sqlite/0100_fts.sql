-- Recherche plein texte (F-10) : table virtuelle FTS5 maintenue par déclencheurs.
CREATE VIRTUAL TABLE IF NOT EXISTS document_fts USING fts5(
  document_id UNINDEXED,
  title,
  description,
  place,
  keywords,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS document_fts_ai AFTER INSERT ON document BEGIN
  INSERT INTO document_fts (document_id, title, description, place, keywords)
  VALUES (new.id, new.title, new.description, new.place, coalesce(new.credits, ''));
END;

CREATE TRIGGER IF NOT EXISTS document_fts_au AFTER UPDATE OF title, description, place, credits ON document BEGIN
  DELETE FROM document_fts WHERE document_id = old.id;
  INSERT INTO document_fts (document_id, title, description, place, keywords)
  VALUES (new.id, new.title, new.description, new.place,
    coalesce(new.credits, '') || ' ' || coalesce((SELECT group_concat(t.label, ' ') FROM document_tag dt JOIN tag t ON t.id = dt.tag_id WHERE dt.document_id = new.id), ''));
END;

CREATE TRIGGER IF NOT EXISTS document_fts_ad AFTER DELETE ON document BEGIN
  DELETE FROM document_fts WHERE document_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS document_tag_fts_ai AFTER INSERT ON document_tag BEGIN
  UPDATE document_fts SET keywords = (
    SELECT coalesce(d.credits, '') || ' ' || coalesce((SELECT group_concat(t.label, ' ') FROM document_tag dt JOIN tag t ON t.id = dt.tag_id WHERE dt.document_id = new.document_id), '')
    FROM document d WHERE d.id = new.document_id
  ) WHERE document_id = new.document_id;
END;

CREATE TRIGGER IF NOT EXISTS document_tag_fts_ad AFTER DELETE ON document_tag BEGIN
  UPDATE document_fts SET keywords = (
    SELECT coalesce(d.credits, '') || ' ' || coalesce((SELECT group_concat(t.label, ' ') FROM document_tag dt JOIN tag t ON t.id = dt.tag_id WHERE dt.document_id = old.document_id), '')
    FROM document d WHERE d.id = old.document_id
  ) WHERE document_id = old.document_id;
END;
