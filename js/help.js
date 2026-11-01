/* Kompetenzbrille – help dialog content.
 *
 * One document for the read-only views (program / framework / matrix) and a
 * separate one for the editor. Kept free of rendering logic so app.js and
 * editor.js can show it in their own modal and language.
 */
(function () {
  "use strict";

  var HELP = {
    de: {
      viewer: {
        title: "Hilfe – Kompetenzbrille",
        body: [
          '<div class="help-doc">',
          '<p class="help-intro">Die <strong>Kompetenzbrille</strong> stellt das <strong>QUADRIGA-Framework für Datenkompetenz</strong> (v4) Studiengängen gegenüber. Sie zeigt in beide Richtungen, welche Module welche Kompetenzen adressieren und wie tief – von der Kompetenz zum Modul und vom Modul zur Kompetenz.</p>',

          "<h3>Oberfläche und Navigation</h3>",
          "<ul>",
          "<li>Der <strong>Sprachwähler</strong> oben rechts wechselt Oberflächensprache, Framework-Übersetzung und die zweisprachigen Begründungen der Zuordnungen gemeinsam.</li>",
          "<li><strong>Programm-Sicht</strong>, <strong>Framework-Sicht</strong> und <strong>Matrix</strong> wechseln die Perspektive auf dieselben Daten. <strong>Editor</strong> öffnet den Bearbeitungsmodus in einer eigenen Seite.</li>",
          "<li>Ansicht, Auswahl und Filter bleiben im Browser gespeichert. Ansicht und Auswahl stehen zusätzlich in der Adresszeile; ein kopierter Link stellt diesen Stand wieder her.</li>",
          "<li><strong>Esc</strong> schließt einen geöffneten Dialog. Mit dem <strong>?</strong> oben rechts öffnen Sie diese Hilfe jederzeit erneut.</li>",
          "</ul>",

          "<h3>Programm-Sicht</h3>",
          "<p>Zeigt einen Studiengang im Verhältnis zum Framework.</p>",
          "<ul>",
          "<li>Die <strong>Abdeckung</strong> oben zählt, wie viele Framework-Kompetenzen der Studiengang adressiert; die farbigen Segmente entsprechen den Phasen.</li>",
          "<li><strong>Nach Kompetenzen</strong>: Kompetenzkarten, gruppiert nach Phasen. Die Chips unter einer Karte nennen die Module, die diese Kompetenz adressieren; die Punkte zeigen die Tiefe.</li>",
          "<li><strong>Nach Modulen</strong>: Modulkarten mit allen adressierten Kompetenzen und der jeweiligen Begründung.</li>",
          "<li>Ein Klick auf eine Kompetenz, einen Modulcode oder einen Chip öffnet die Detailansicht mit Lernzielen, Themen und allen Zuordnungen.</li>",
          "<li>Die Seitenleiste filtert nach <strong>Phasen</strong>, <strong>einzelnen Kompetenzen</strong>, <strong>Modulkategorien</strong> und <strong>Mindesttiefe</strong>. Die <strong>Dimensionen</strong> (Wissen, Fertigkeiten, Beispiele) steuern, welche Textfelder in den Kompetenzkarten erscheinen. <strong>Nur adressierte Kompetenzen</strong> blendet leere Karten aus.</li>",
          "</ul>",

          "<h3>Framework-Sicht</h3>",
          "<p>Wählt ein oder mehrere Studienprogramme und geht von der Kompetenz aus.</p>",
          "<ul>",
          "<li>Über <strong>+ Studiengang hinzufügen</strong> lassen sich mehrere Programme vergleichen; das ✕ vor einem Eintrag entfernt es wieder.</li>",
          "<li>Ein Klick auf eine Kompetenz zeigt unten alle Module, die sie adressieren – gruppiert nach Programm, mit Tiefe und Begründung. Die Zahl am Chip ist die Anzahl der Module.</li>",
          "<li>Ab zwei Programmen ist der <strong>Vergleich</strong> aktiv: farbige Punkte markieren, welches Programm eine Kompetenz adressiert. Orange hinterlegte Chips sind Unterschiede (nicht in allen Programmen), grüne sind Gemeinsamkeiten (in allen). Der Filter <strong>alle / nur Unterschiede / nur Gemeinsamkeiten</strong> blendet entsprechend aus.</li>",
          "<li>Die Detailansicht nennt pro Programm die höchste erreichte Tiefe und listet alle zugeordneten Module.</li>",
          "</ul>",

          "<h3>Matrix</h3>",
          "<p>Heatmap aller Kompetenzen (Zeilen) gegen alle Module (Spalten) eines Studiengangs.</p>",
          "<ul>",
          "<li>Farbe und Legende zeigen die Tiefe; leere Zellen bedeuten keine Zuordnung.</li>",
          "<li>Zeilen- und Spaltenköpfe bleiben beim Scrollen sichtbar, die Kompetenzspalte ist fixiert.</li>",
          "<li>Ein Klick auf eine Zelle öffnet genau diese Zuordnung, auf einen Modulkopf das Modul, auf eine Kompetenz die Kompetenz. Beim Überfahren erscheint eine Kurzvorschau.</li>",
          "</ul>",

          "<h3>Tiefe der Zuordnung</h3>",
          "<ul>",
          "<li><strong>1 – berührt</strong>: Das Thema wird am Rand behandelt.</li>",
          "<li><strong>2 – teilweise</strong>: Ein wesentlicher Teil des Moduls trägt zur Kompetenz bei.</li>",
          "<li><strong>3 – Schwerpunkt</strong>: Die Kompetenz ist zentrales Ziel des Moduls.</li>",
          "</ul>",
          '<p class="muted">Die Tiefe ist eine redaktionelle Einschätzung, keine Benotung und kein Prüfungsanspruch.</p>',

          "<h3>Orientierungswissen</h3>",
          "<p>Das QUADRIGA-Framework führt das <strong>Orientierungswissen</strong> als Phase 0, also außerhalb des eigentlichen Datenlebenszyklus. In der Anwendung erscheint es als unnummerierte Kompetenz vor allen Phasen. Module können über das reservierte Ziel <code>__orientation</code> darauf verweisen.</p>",

          "<h3>Datengrundlage und Grenzen</h3>",
          "<ul>",
          "<li>Die Zuordnung <strong>Modul ↔ Kompetenz</strong> ist eine redaktionelle Annäherung auf Basis der Modulbeschreibungen und in den Datendateien dokumentiert. Sie ist keine Akkreditierung oder offizielle Gleichsetzung.</li>",
          "<li>Die Modullisten bilden die vollständigen Kataloge der Prüfungsordnungen ab – inklusive Wahl- und Alternativmodulen. Leistungspunkte lassen sich daher nicht zu einer Studiengangssumme addieren.</li>",
          "<li>Maßgeblich sind die offiziellen Prüfungsordnungen und Modulhandbücher der Hochschulen. Die Anwendung erhebt keinen Anspruch auf Vollständigkeit oder Aktualität.</li>",
          "<li>Das Framework ist auf die beiden QUADRIGA-Übersetzungen (Deutsch/Englisch) festgelegt.</li>",
          "</ul>",

          "<h3>Lokal im Browser</h3>",
          "<p>Die Anwendung läuft vollständig im Browser. Es gibt kein Benutzerkonto, und es werden keine Eingaben an einen Server übertragen. Einstellungen und der letzte Stand liegen nur im lokalen Speicher des Browsers.</p>",
          "</div>"
        ].join("")
      },

      editor: {
        title: "Hilfe – Editor",
        body: [
          '<div class="help-doc">',
          '<p class="help-intro">Der <strong>Editor</strong> bearbeitet die YAML-Dateien der Studiengänge direkt im Browser. Er ist vollständig clientseitig: Nichts wird automatisch hochgeladen, gespeichert oder committet – Sie entscheiden am Ende über Download und Ablage im Repository.</p>',

          "<h3>In fünf Schritten</h3>",
          '<ol class="help-steps">',
          "<li><strong>Laden</strong>: Programm aus dem Repository wählen, eine YAML-Datei hochladen oder ein neues Programm anlegen.</li>",
          "<li><strong>Bearbeiten</strong>: Stammdaten, Modulkategorien und Module pflegen, Kompetenzen zuordnen.</li>",
          "<li><strong>Prüfen</strong>: Die Seitenleiste zeigt Schemafehler; jeder Eintrag springt zum betroffenen Modul.</li>",
          "<li><strong>Sichern</strong>: Entwurf im Browser speichern oder automatisch sichern lassen.</li>",
          "<li><strong>Exportieren</strong>: YAML herunterladen, im Repository ablegen und in <code>data/manifest.yaml</code> eintragen; danach <code>npm run all</code> ausführen und die Änderung committen.</li>",
          "</ol>",

          "<h3>Programm laden</h3>",
          "<ul>",
          "<li><strong>Programm aus dem Repository</strong> lädt einen vorhandenen Studiengang aus <code>data/programs/</code>.</li>",
          "<li><strong>YAML-Datei hochladen</strong> öffnet eine lokale Datei; <strong>Neues Programm</strong> startet mit einer Vorlage.</li>",
          "<li>Beim Wechsel oder Neuanlegen fragt der Editor nach, wenn ungespeicherte Änderungen verloren gehen würden.</li>",
          "<li><strong>ID und Dateiname müssen übereinstimmen.</strong> Die beiden Schaltflächen neben dem Dateinamen helfen beim Angleichen.</li>",
          "</ul>",

          "<h3>Stammdaten und Module</h3>",
          "<ul>",
          "<li><strong>Stammdaten</strong>: ID, Titel, Hochschule, Kürzel, URL, Sprache, Quelle und Quellenangabe.</li>",
          "<li><strong>Modulkategorien</strong> bestimmen die Badges an den Modulen und müssen dort referenziert werden.</li>",
          "<li><strong>Module</strong>: Code, Titel, Leistungspunkte (1–60), Kategorie, Lern- und Qualifikationsziele sowie Themen und Inhalte.</li>",
          "<li><strong>Zuordnungen</strong>: Framework, Kompetenz, Tiefe (1–3) und Begründung. Die deutsche Begründung ist Pflicht, die englische optional. Für das Orientierungswissen steht das reservierte Ziel <code>__orientation</code> bereit.</li>",
          "</ul>",

          "<h3>Framework-Referenz und Original</h3>",
          "<ul>",
          "<li>Das rechte Panel zeigt die Kompetenzen des gewählten Frameworks, durchsuchbar über das Filterfeld.</li>",
          "<li><strong>+</strong> fügt eine Zuordnung zum zuletzt geöffneten oder fokussierten Modul hinzu.</li>",
          "<li>Der Reiter <strong>Original</strong> zeigt die unveränderte Fassung aus dem Repository im Vergleich zum aktuellen Entwurf (neu, geändert, entfernt).</li>",
          "</ul>",

          "<h3>Löschen</h3>",
          "<ul>",
          "<li><strong>Löschung vormerken</strong> streicht vorhandene Einträge durch; sie werden erst beim Export entfernt und bleiben bis dahin sichtbar.</li>",
          "<li>Neu angelegte, noch leere Einträge lassen sich direkt löschen.</li>",
          "<li>Über die Anzahl der vorgemerkten Löschungen in der Seitenleiste öffnet sich eine Übersicht aller entfernten Einträge.</li>",
          "</ul>",

          "<h3>Entwürfe und Speichern</h3>",
          "<ul>",
          "<li>Änderungen werden nach kurzer Pause automatisch als Entwurf im Browser gespeichert; zusätzlich gibt es <strong>In Browser speichern</strong>.</li>",
          "<li>Mehrere Entwürfe werden getrennt gehalten und können fortgesetzt oder gelöscht werden.</li>",
          "<li>Entwürfe liegen nur im <code>localStorage</code> des Browsers. Beim Löschen der Browserdaten sind sie verloren – der Export ist die dauerhafte Sicherung.</li>",
          "</ul>",

          "<h3>Prüfen und Exportieren</h3>",
          "<ul>",
          "<li>Der Editor prüft laufend gegen <code>data/schemas/program-schema.json</code>: Pflichtfelder, ID-Muster, Leistungspunkte, Kategorien, Framework- und Kompetenzverweise, Tiefe sowie die Begründungsregeln.</li>",
          "<li>Fehler erscheinen in der Seitenleiste und springen beim Anklicken zum betroffenen Modul. Bei Fehlern ist der Export blockiert.</li>",
          "<li><strong>YAML herunterladen</strong> erzeugt <code>&lt;id&gt;.yaml</code>, ohne vorgemerkte Löschungen und ohne leere optionale Felder. Es wird nichts gepusht oder committet.</li>",
          "<li>Danach die Datei nach <code>data/programs/</code> legen, in <code>data/manifest.yaml</code> registrieren und <code>npm run all</code> ausführen (JSON-LD, Favicon, Validierung).</li>",
          "</ul>",

          "<h3>Hinweise zum Datenformat</h3>",
          "<ul>",
          "<li>IDs und Modulcodes beginnen mit einem Buchstaben bzw. einer Ziffer, enthalten nur Buchstaben, Ziffern, Punkt, Unterstrich und Bindestrich; die Programm-ID ist maximal 64 Zeichen lang.</li>",
          "<li>Kompetenzcodes wie <code>\"1.1\"</code> in Anführungszeichen setzen, damit sie als Text und nicht als Zahl gelesen werden.</li>",
          "<li>Mindestens eine Kategorie und ein Modul sind erforderlich; Kategorie-, Framework- und Kompetenzverweise müssen existieren.</li>",
          "</ul>",

          "<h3>Grenzen</h3>",
          "<p>Der Editor ist ein lokales Arbeitswerkzeug, kein Redaktionssystem: Es gibt keine Benutzerverwaltung, keine parallele Bearbeitung und keine Versionskontrolle. Die Quelle der Wahrheit bleibt das Repository; Änderungen werden erst durch Download, Ablage und Commit dauerhaft.</p>",
          "</div>"
        ].join("")
      }
    },

    en: {
      viewer: {
        title: "Help – Kompetenzbrille",
        body: [
          '<div class="help-doc">',
          '<p class="help-intro"><strong>Kompetenzbrille</strong> compares the <strong>QUADRIGA data literacy framework</strong> (v4) with study programs. It shows in both directions which modules address which competencies and how deeply – from competency to module and from module to competency.</p>',

          "<h3>Interface and navigation</h3>",
          "<ul>",
          "<li>The <strong>language switcher</strong> at the top right changes the interface language, the framework translation and the bilingual mapping rationales together.</li>",
          "<li><strong>Program view</strong>, <strong>Framework view</strong> and <strong>Matrix</strong> switch between perspectives on the same data. <strong>Editor</strong> opens the editing mode on its own page.</li>",
          "<li>View, selection and filters are stored in the browser. The view and selection are also kept in the address bar, so a copied link restores that state.</li>",
          "<li><strong>Esc</strong> closes an open dialog. The <strong>?</strong> at the top right reopens this help at any time.</li>",
          "</ul>",

          "<h3>Program view</h3>",
          "<p>Shows one study program in relation to the framework.</p>",
          "<ul>",
          "<li>The <strong>coverage</strong> block at the top counts how many framework competencies the program addresses; the coloured segments correspond to the phases.</li>",
          "<li><strong>By competency</strong>: competency cards grouped by phase. The chips below a card name the modules that address the competency; the dots show the depth.</li>",
          "<li><strong>By module</strong>: module cards with all addressed competencies and their rationales.</li>",
          "<li>Clicking a competency, module code or chip opens the detail view with learning objectives, topics and all mappings.</li>",
          "<li>The sidebar filters by <strong>phases</strong>, <strong>individual competencies</strong>, <strong>module categories</strong> and <strong>minimum depth</strong>. The <strong>dimensions</strong> (knowledge, skills, examples) control which text fields appear in the competency cards. <strong>Only addressed competencies</strong> hides empty cards.</li>",
          "</ul>",

          "<h3>Framework view</h3>",
          "<p>Selects one or more study programs and starts from the competency.</p>",
          "<ul>",
          "<li><strong>+ Add study program</strong> lets you compare several programs; the ✕ in front of an entry removes it again.</li>",
          "<li>Clicking a competency lists all modules that address it below – grouped by program, with depth and rationale. The number on the chip is the number of modules.</li>",
          "<li>With two or more programs the <strong>comparison</strong> is active: coloured dots mark which program addresses a competency. Orange chips are differences (not in all programs), green chips are overlaps (in all). The filter <strong>all / differences only / overlaps only</strong> hides the rest.</li>",
          "<li>The detail view names the highest depth reached per program and lists all mapped modules.</li>",
          "</ul>",

          "<h3>Matrix</h3>",
          "<p>Heatmap of all competencies (rows) against all modules (columns) of one study program.</p>",
          "<ul>",
          "<li>Colour and legend show the depth; empty cells mean no mapping.</li>",
          "<li>Row and column headers stay visible while scrolling; the competency column is fixed.</li>",
          "<li>Clicking a cell opens exactly that mapping, a module header opens the module, a competency opens the competency. Hovering shows a short preview.</li>",
          "</ul>",

          "<h3>Mapping depth</h3>",
          "<ul>",
          "<li><strong>1 – peripheral</strong>: the topic is touched on the side.</li>",
          "<li><strong>2 – partial</strong>: a substantial part of the module contributes to the competency.</li>",
          "<li><strong>3 – core</strong>: the competency is a central objective of the module.</li>",
          "</ul>",
          '<p class="muted">Depth is an editorial estimate, not a grade or an examination claim.</p>',

          "<h3>Conceptual knowledge</h3>",
          "<p>The QUADRIGA framework stores <strong>conceptual knowledge</strong> (Orientierungswissen) as phase 0, outside the actual data lifecycle. In the application it appears as an unnumbered competency before all phases. Modules can point to it with the reserved target <code>__orientation</code>.</p>",

          "<h3>Data basis and limitations</h3>",
          "<ul>",
          "<li>The <strong>module ↔ competency mapping</strong> is an editorial approximation based on the module descriptions and documented in the data files. It is not an accreditation or an official equivalence.</li>",
          "<li>The module lists represent the complete catalogues of the examination regulations – including elective and alternative modules. Credit points therefore do not add up to a degree total.</li>",
          "<li>The official examination regulations and module handbooks of the institutions are authoritative. The application makes no claim to completeness or currency.</li>",
          "<li>The framework is fixed to the two QUADRIGA translations (German/English).</li>",
          "</ul>",

          "<h3>Local in the browser</h3>",
          "<p>The application runs entirely in the browser. There is no user account, and no input is transmitted to a server. Settings and the last state live only in the local browser storage.</p>",
          "</div>"
        ].join("")
      },

      editor: {
        title: "Help – Editor",
        body: [
          '<div class="help-doc">',
          '<p class="help-intro">The <strong>editor</strong> edits the study-program YAML files directly in the browser. It is fully client-side: nothing is uploaded, saved or committed automatically – you decide at the end whether to download the file and add it to the repository.</p>',

          "<h3>In five steps</h3>",
          '<ol class="help-steps">',
          "<li><strong>Load</strong>: choose a program from the repository, upload a YAML file or create a new program.</li>",
          "<li><strong>Edit</strong>: maintain base information, module categories and modules, and map competencies.</li>",
          "<li><strong>Check</strong>: the sidebar lists schema errors; each entry jumps to the affected module.</li>",
          "<li><strong>Save</strong>: save the draft in the browser or let it autosave.</li>",
          "<li><strong>Export</strong>: download the YAML, place it in the repository, add it to <code>data/manifest.yaml</code>, then run <code>npm run all</code> and commit the change.</li>",
          "</ol>",

          "<h3>Loading a program</h3>",
          "<ul>",
          "<li><strong>Program from repository</strong> loads an existing study program from <code>data/programs/</code>.</li>",
          "<li><strong>Upload YAML file</strong> opens a local file; <strong>New program</strong> starts from a template.</li>",
          "<li>When switching or creating a program the editor asks before discarding unsaved changes.</li>",
          "<li><strong>ID and file name must match.</strong> The two buttons next to the file name help to align them.</li>",
          "</ul>",

          "<h3>Base information and modules</h3>",
          "<ul>",
          "<li><strong>Base information</strong>: ID, title, institution, abbreviation, URL, language, source and source label.</li>",
          "<li><strong>Module categories</strong> provide the badges on modules and must be referenced there.</li>",
          "<li><strong>Modules</strong>: code, title, credit points (1–60), category, learning and qualification objectives, and topics and contents.</li>",
          "<li><strong>Mappings</strong>: framework, competency, depth (1–3) and rationale. The German rationale is required, the English one optional. The reserved target <code>__orientation</code> is available for conceptual knowledge.</li>",
          "</ul>",

          "<h3>Framework reference and original</h3>",
          "<ul>",
          "<li>The right panel shows the competencies of the selected framework; the filter field searches them.</li>",
          "<li><strong>+</strong> adds a mapping to the most recently opened or focused module.</li>",
          "<li>The <strong>Original</strong> tab shows the unchanged repository version compared with the current draft (new, changed, removed).</li>",
          "</ul>",

          "<h3>Deleting</h3>",
          "<ul>",
          "<li><strong>Mark for deletion</strong> strikes out existing entries; they are removed only on export and stay visible until then.</li>",
          "<li>Newly created, still empty entries can be deleted directly.</li>",
          "<li>The count of marked deletions in the sidebar opens an overview of all entries that will be removed.</li>",
          "</ul>",

          "<h3>Drafts and saving</h3>",
          "<ul>",
          "<li>Changes are autosaved as a browser draft after a short pause; <strong>Save in browser</strong> is also available.</li>",
          "<li>Several drafts are kept separately and can be resumed or deleted.</li>",
          "<li>Drafts live only in the browser <code>localStorage</code>. Clearing browser data loses them – the export is the durable copy.</li>",
          "</ul>",

          "<h3>Validation and export</h3>",
          "<ul>",
          "<li>The editor validates continuously against <code>data/schemas/program-schema.json</code>: required fields, ID pattern, credit points, categories, framework and competency references, depth and rationale rules.</li>",
          "<li>Errors appear in the sidebar and jump to the affected module when clicked. Export is blocked while errors remain.</li>",
          "<li><strong>Download YAML</strong> creates <code>&lt;id&gt;.yaml</code> without marked deletions and without empty optional fields. Nothing is pushed or committed.</li>",
          "<li>Then place the file in <code>data/programs/</code>, register it in <code>data/manifest.yaml</code> and run <code>npm run all</code> (JSON-LD, favicon, validation).</li>",
          "</ul>",

          "<h3>Notes on the data format</h3>",
          "<ul>",
          "<li>IDs and module codes start with a letter or digit and contain only letters, digits, dot, underscore and hyphen; the program ID is at most 64 characters long.</li>",
          "<li>Put competency codes such as <code>\"1.1\"</code> in quotes so they are read as text, not as numbers.</li>",
          "<li>At least one category and one module are required; category, framework and competency references must exist.</li>",
          "</ul>",

          "<h3>Limitations</h3>",
          "<p>The editor is a local working tool, not a content-management system: there is no user management, no concurrent editing and no version control. The repository remains the source of truth; changes become durable only through download, placement and commit.</p>",
          "</div>"
        ].join("")
      }
    }
  };

  window.KB_HELP = {
    get: function (scope, lang) {
      var dict = HELP[lang] || HELP.de;
      return dict[scope] || dict.viewer;
    }
  };
})();
