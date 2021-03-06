const Listing = require('../models/Listing');
const makeData = require('../utils/pdx-data/presentation-data');
const makeHerbs = require('../utils/pdx-data/makeHerbs');
const { ensureAuth } = require('../middleware/ensureAuth');
const { Router } = require('express');
const { getDistanceByAddress, getDistanceByZip, getListingMap } = require('../utils/distance-calc');
const parseBoolean = require('../utils/parseBoolean');

module.exports = Router()
  .post('/', ensureAuth, (req, res, next) => {
    const {
      title,
      user,
      location,
      category,
      dietary,
      dateListed,
      expiration
    } = req.body;

    Listing
      .create({ title, user, location, category, dietary, dateListed, expiration })
      .then(created => res.send(created))
      .catch(next);
  })
  
  .get('/hotzips', (req, res, next) => {
    Listing
      .hotZipcodes()
      .then(zips => res.send(zips))
      .catch(next);
  })

  .get('/', (req, res, next) => {
    return Listing
      .find({ archived: false })
      .select({
        __v: false,
        location: false
      })
      .lean()
      .then(listings => res.send(listings))
      .catch(next);
  })

  .get('/archived', ensureAuth, (req, res, next) => {
    if(req.user.role == 'Admin') {
      return Listing
        .find()
        .select({
          __v: false,
          location: false
        })
        .lean()
        .then(listing => res.send(listing))
        .catch(next);
    } else {
      const error = new Error('Administrative Access Only');
      error.status = 420;
      return next(error);
    }
  })

  .get('/close', ensureAuth, (req, res, next) => { //edited to get map too... maybe
    Listing
      .find({ archived: false })
      .then(list => {
        return Promise.all(list.map(listing => {
          return getDistanceByAddress(req.user.location, listing.location);
        })).then(distances => {
          return distances.map((distance, i) => {
            return { _id: list[i]._id, distance };
          });
        });
      })
      .then((activeListings) => {
        return activeListings.filter(listing => {
          return listing.distance <= req.query.radiusInMiles;  
        });
      })
      .then(closest => {  
        return Promise.all(
          closest.map(({ _id }) => Listing.findById(_id))
        )
          .then(matches => {
            const addresses = matches.map(match => (match.location.address)).join('|');
            res.send({ 
              url: getListingMap(req.user.location.address, addresses),
              matches
            });
          });
      })
      .catch(next);
  })

  .get('/close/zip', (req, res, next) => {
    Listing
      .find({ archived: false })
      .then(list => {
        return Promise.all(list.map(listing => {
          return getDistanceByZip(req.query.zip, listing.location.address);
        })).then(distances => {
          return distances.map((distance, i) => {
            return { _id: list[i]._id, distance };
          });
        });
      })
      .then((activeListings) => {
        return activeListings.filter(listing => {
          return listing.distance <= req.query.radiusInMiles;
        });
      })
      .then(closest => {
        return Promise.all(
          closest.map(({ _id }) => Listing.findById(_id))
        );
      })
      .then(matches => {
        const addresses = matches.map(match => (match.location.address)).join('|');
        res.send({ 
          url: getListingMap(req.query.zip, addresses),
          matches
        });
      })
      .catch(next);
  })
    
  .get('/dietary', (req, res, next) => {
    const searchObject = parseBoolean(req.query);
    Listing
      .find(searchObject)
      .select({
        __v: false
      })
      .lean()
      .then(foundListings => res.send(foundListings))
      .catch(next);
  })

  .get('/dietary/close', (req, res, next) => {
    const closeSearchObject = parseBoolean(req.query);

    Listing
      .find(closeSearchObject)
      .then(list => {
        return Promise.all(list.map(listing => {
          return getDistanceByZip(req.query.zip, listing.location.address);
        })).then(distances => {
          return distances.map((distance, i) => {
            return { _id: list[i]._id, distance };
          });
        });
      })
      .then((activeListings) => {
        return activeListings.filter(listing => {
          return listing.distance <= req.query.radiusInMiles;
        });
      })
      .then(closest => {
        return Promise.all(
          closest.map(({ _id }) => Listing.findById(_id))
        );
      })
      .then(foundListings => res.send(foundListings))
      .catch(next);
  })

  .get('/keyword', (req, res, next) => {
    let regex = new RegExp(req.query.searchTerm, 'i');
    Listing
      .find({
        title: regex,
        archived: false
      })
      .select({
        __v: false
      })
      .lean()
      .then(foundListings => res.send(foundListings))
      .catch(next);
  })

  .get('/keyword/close', (req, res, next) => {
    let regex = new RegExp(req.query.searchTerm, 'i');
    Listing
      .find({
        title: regex,
        archived: false
      })
      .then(list => {
        return Promise.all(list.map(listing => {
          return getDistanceByZip(req.query.zip, listing.location.address);
        })).then(distances => {
          return distances.map((distance, i) => {
            return { _id: list[i]._id, distance };
          });
        });
      })
      .then((activeListings) => {
        return activeListings.filter(listing => {
          return listing.distance <= req.query.radiusInMiles;
        });
      })
      .then(closest => {
        return Promise.all(
          closest.map(({ _id }) => Listing.findById(_id))
        );
      })
      .then(matches => {
        const addresses = matches.map(match => (match.location.address)).join('|');
        res.send({ 
          url: getListingMap(req.query.zip, addresses),
          matches
        });
      })
      .catch(next);
  })
  
  .get('/:id', ensureAuth, (req, res, next) => {
    Listing
      .findById(req.params.id)
      .then(found => {
        if(found.archived == false || req.user._id == found.user || req.user.role == 'Admin'){
          return Listing
            .findById(req.params.id)
            .select({
              __v: false,
              location: false,
            })
            .lean()
            .then(found => res.send(found))
            .catch(next);
        } else {
          const error = new Error('Listing has been archived');
          error.status = 420;
          return next(error);
        }
      });
  })

  .get('/user/:id', (req, res, next) => {
    Listing
      .find({ user: req.params.id, archived: false })
      .lean()
      .then(result => {
        res.send(result);
      })
      .catch(next);
  })

  .get('/zip/:zip', (req, res, next) => {
    Listing
      .find({ 'location.zip': req.params.zip, archived: false })
      .lean()
      .then(result => {
        res.send(result);
      })
      .catch(next);
  })


  .patch('/:id', ensureAuth, (req, res, next) => {
    if(req.body.expiration) {
      const error = new Error('Cannot adjust expiration date');
      error.status = 311;
      return next(error);
    }
    Listing
      .findById(req.params.id)
      .then(found => {
        if(req.user._id == found.user || req.user._id == 'Admin'){
          return Listing
            .findByIdAndUpdate(req.params.id, { ...req.body }, { new: true })
            .select({
              __v: false,
              location: false
            })
            .lean()
            .then(updatedListing => res.send(updatedListing))
            .catch(next);
        } else {
          const error = new Error('Unauthorized to edit listing');
          error.status = 420;
          return next(error);
        }
      });
  })

  .delete('/:id', ensureAuth, (req, res, next) => {
    Listing
      .findById(req.params.id)
      .then(found => {
        if(req.user._id == found.user || req.user.role == 'Admin'){
          return Listing
            .findByIdAndUpdate(req.params.id, { archived: true }, { new: true })
            .select({
              _id: true,
              archived: true
            })
            .lean()
            .then(deleted => res.send(deleted))
            .catch(next);
        } else {
          const error = new Error('Unauthorized to delete listing');
          error.status = 420;
          return next(error);
        }
      });
  })

  .get('/admin/populate', ensureAuth, (req, res, next) => {
    makeData()
      .catch(next);
  })

  .get('/admin/herbs', ensureAuth, (req, res, next) => {
    makeHerbs()
      .catch(next);
  });
