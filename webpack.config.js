module.exports = {
  entry: './src/index.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  output: {
    path: __dirname + '/dist/js',
    filename: 'galaxy-collision.js',
    library: 'GalaxyCollision'
  },
  devtool: 'source-map'
}
