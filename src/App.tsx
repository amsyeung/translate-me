import './App.css';
import Panel from './component/Panel';
// import { useDoubleClickToast } from './hooks/useDoubleClickToast';
// import { useSelectionToast } from './hooks/useSelectionToast';

function App() {

  // useDoubleClickToast();

  return (
    <div className="flex flex-col gap-2 p-3">
      <Panel />
    </div>
  )
}

export default App
