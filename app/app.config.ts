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
        title: 'app-dialog-title',
        description: 'app-dialog-description'
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
