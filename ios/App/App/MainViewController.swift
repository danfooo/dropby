import Capacitor

// The app's web view. Plugins that live in this target rather than in an npm package
// have to be registered by hand, here.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveActivityPlugin())
    }
}
