export default defineAppConfig({
  ui: {
    colors: {
      primary: 'amber',
      neutral: 'stone'
    },
    alert: {
      slots: {
        root: 'app-alert'
      }
    },
    button: {
      slots: {
        base: 'app-button'
      }
    },
    card: {
      slots: {
        root: 'app-card'
      }
    },
    modal: {
      slots: {
        overlay: 'app-dialog-overlay',
        content: 'app-dialog-surface',
        header: 'shrink-0',
        body: 'min-h-0 overscroll-contain',
        footer: 'shrink-0 flex-wrap',
        title: 'app-dialog-title',
        description: 'app-dialog-description'
      }
    },
    slideover: {
      slots: {
        header: 'shrink-0',
        body: 'min-h-0 overflow-y-auto overscroll-contain',
        footer: 'shrink-0 flex-wrap'
      }
    },
    switch: {
      slots: {
        base: 'app-switch-control',
        thumb: 'app-switch-thumb'
      }
    }
  }
})
