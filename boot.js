// A classic script also runs from file://, unlike the application's ES module.
if (location.protocol === 'file:') {
  document.documentElement.dataset.localFile = 'true';
  document.querySelector('#launch-help').hidden = false;
} else {
  const application = document.createElement('script');
  application.type = 'module';
  application.src = './app.js';
  document.head.append(application);
}
