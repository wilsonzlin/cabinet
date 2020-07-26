(() => {
  const zucchini = Zucchini.createZucchini({
    collectionService: {
      list: async ({source, filter, types}) => {
        return (await fetch(`/files/${source.path.join('/')}`)).json();
      },
      getCustomPlaylists: async ({}) => {
        return {playlists: []};
      },
    },
  });
  ReactDOM.render(
    React.createElement(zucchini.views.App),
    document.querySelector('#root'),
  );
})();
